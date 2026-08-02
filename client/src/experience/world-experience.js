/**
 * Read-only projection for the persistent-world presentation.
 *
 * This module never emits simulation commands and never mutates its inputs.
 */
const WORLD_DAY_MS = 86_400_000;
const NODE_POSITIONS = Object.freeze([
  Object.freeze({ x: 19, y: 24 }),
  Object.freeze({ x: 81, y: 28 }),
  Object.freeze({ x: 54, y: 82 }),
]);
const ACTOR_POSITIONS = Object.freeze([
  Object.freeze({ x: 8, y: 58 }),
  Object.freeze({ x: 91, y: 60 }),
  Object.freeze({ x: 72, y: 8 }),
]);
const MAX_OBSERVABLE_ACTORS = 3;
const SIGNAL_TRADE_BUCKET_MS = 30_000;
const RESERVED_SIGNAL_CATEGORIES = Object.freeze([
  'company',
  'relationship',
  'public',
]);

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positive(value, fallback = 0) {
  const parsed = finite(value, fallback);
  return parsed > 0 ? parsed : fallback;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, finite(value)));
}

function priceTicks(worldSecurity, marketSecurity) {
  return Math.max(
    1,
    Math.round(
      positive(
        marketSecurity?.lastPriceTicks,
        positive(worldSecurity?.lastPrice, 0) * 100,
      ),
    ),
  );
}

function previousCloseTicks(worldSecurity, marketSecurity, lastTicks) {
  return Math.max(
    1,
    Math.round(
      positive(
        marketSecurity?.previousCloseTicks,
        positive(worldSecurity?.previousCloseTicks, lastTicks),
      ),
    ),
  );
}

function compactText(value, maximum = 34) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maximum) return text;
  return `${text.slice(0, Math.max(1, maximum - 1))}…`;
}

function publicSignalText(value) {
  return String(value ?? '').replace(
    /\b(\d+)\s+priceTicks\b/g,
    (_, ticks) => `¥${(Number(ticks) / 100).toFixed(2)}`,
  );
}

function eventSignalTime(event) {
  for (const value of [event?.effectiveAtMs, event?.virtualMs]) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return (
    Math.max(0, finite(event?.effectiveAt, finite(event?.tick))) *
    WORLD_DAY_MS
  );
}

function eventSignalCategory(event) {
  const type = String(event?.type ?? '').toLowerCase();
  if (type.includes('trade') || type.includes('market_fill')) return 'trade';
  if (type.startsWith('company_') || type.includes('operating_result')) {
    return 'company';
  }
  if (
    type.includes('role_') ||
    type.includes('redemption') ||
    type.includes('obligation') ||
    type.includes('household_') ||
    type.includes('clue_') ||
    type.includes('narrative_') ||
    type.includes('relationship')
  ) {
    return 'relationship';
  }
  return 'public';
}

function tradeSignalParts(event) {
  const summary = String(event?.summary ?? '');
  const symbol =
    String(event?.symbol ?? '').trim() ||
    summary.match(/\b[A-Z]{2,}\d+\b/)?.[0] ||
    '市场';
  const quantityMatch =
    summary.match(/成交\s*(\d+)\s*股/) ??
    summary.match(/撮合\s*(\d+)\s*股/) ??
    summary.match(/\b(\d+)\s*股(?:以|，|,)/);
  const priceTicksMatch = summary.match(/(\d+)\s+priceTicks\b/);
  const decimalPriceMatch =
    summary.match(/(?:均价|以)\s*¥?\s*(\d+(?:\.\d+)?)/);
  return {
    symbol,
    quantity: Math.max(0, Math.trunc(finite(quantityMatch?.[1]))),
    priceText: priceTicksMatch
      ? `¥${(Number(priceTicksMatch[1]) / 100).toFixed(2)}`
      : decimalPriceMatch
        ? `¥${Number(decimalPriceMatch[1]).toFixed(2)}`
        : '',
  };
}

function signalCandidate(event) {
  return {
    id: String(event.id ?? ''),
    tick: Math.max(0, Math.trunc(finite(event.tick))),
    type: String(event.type ?? 'world_event'),
    category: eventSignalCategory(event),
    eventCount: 1,
    time: eventSignalTime(event),
    label: compactText(
      publicSignalText(event.summary ?? '世界有了新变化'),
    ),
  };
}

function aggregateTradeSignals(events) {
  const groups = new Map();
  for (const event of events) {
    const time = eventSignalTime(event);
    const parts = tradeSignalParts(event);
    const bucket = Math.floor(time / SIGNAL_TRADE_BUCKET_MS);
    const key = `${parts.symbol}:${bucket}`;
    const current = groups.get(key);
    if (!current) {
      groups.set(key, {
        ...signalCandidate(event),
        id: `trade:${parts.symbol}:${bucket}`,
        category: 'trade',
        eventCount: 1,
        quantity: parts.quantity,
        symbol: parts.symbol,
        priceText: parts.priceText,
      });
      continue;
    }
    current.eventCount += 1;
    current.quantity += parts.quantity;
    if (
      time > current.time ||
      (time === current.time &&
        String(event.id ?? '').localeCompare(current.latestEventId ?? '') > 0)
    ) {
      current.time = time;
      current.tick = Math.max(0, Math.trunc(finite(event.tick)));
      current.type = String(event.type ?? 'world_event');
      current.priceText = parts.priceText;
      current.latestEventId = String(event.id ?? '');
    }
  }
  return [...groups.values()].map((group) => {
    if (group.eventCount > 1) {
      group.label = compactText(
        `${group.symbol} ${group.eventCount} 笔成交 · 合计 ${group.quantity} 股${
          group.priceText ? ` · 最新 ${group.priceText}` : ''
        }`,
      );
    }
    delete group.quantity;
    delete group.symbol;
    delete group.priceText;
    delete group.latestEventId;
    return group;
  });
}

function compareSignals(left, right) {
  return (
    right.time - left.time ||
    String(right.id).localeCompare(String(left.id))
  );
}

function latestSignals(world, maximum) {
  const events = [...(world.eventLog ?? [])];
  const tradeEvents = events.filter(
    (event) => eventSignalCategory(event) === 'trade',
  );
  const candidates = [
    ...events
      .filter((event) => eventSignalCategory(event) !== 'trade')
      .map(signalCandidate),
    ...aggregateTradeSignals(tradeEvents),
  ].sort(compareSignals);
  const selected = [];
  const selectedIds = new Set();
  for (const category of RESERVED_SIGNAL_CATEGORIES) {
    const candidate = candidates.find((item) => item.category === category);
    if (!candidate || selected.length >= maximum) continue;
    selected.push(candidate);
    selectedIds.add(candidate.id);
  }
  for (const candidate of candidates) {
    if (selected.length >= maximum) break;
    if (selectedIds.has(candidate.id)) continue;
    selected.push(candidate);
    selectedIds.add(candidate.id);
  }
  return selected
    .sort(compareSignals)
    .map(({ time: _time, ...signal }) => signal);
}

function roleResponsibility(world, marketSnapshot) {
  const role = world.player.roleType;
  const state = world.player.roleState ?? {};
  const cash = Math.max(0, finite(world.player.cash));
  const account = marketSnapshot?.accounts?.player ?? {};

  if (role === 'household') {
    const reserve = Math.max(1, positive(state.cashReserve, 1));
    const cover = cash / reserve;
    return {
      id: 'responsibility-household-liquidity',
      kind: 'responsibility',
      label: '生活缓冲',
      value: `${cover.toFixed(1)}×`,
      actual: cash,
      ideal: reserve,
      tension: clamp01(1 - cover / 2),
      tone: cover < 1 ? 'strained' : 'steady',
      route: 'decision',
    };
  }

  if (role === 'professional') {
    const limitBps = Math.max(
      1,
      Math.round(positive(state.drawdownLimit, 0.1) * 10_000),
    );
    const drawdownBps = Math.max(0, finite(account.drawdownBps));
    return {
      id: 'responsibility-professional-drawdown',
      kind: 'responsibility',
      label: '受托回撤',
      value: `${(drawdownBps / 100).toFixed(1)}%`,
      actual: drawdownBps,
      ideal: limitBps,
      tension: clamp01(drawdownBps / limitBps),
      tone: drawdownBps > limitBps * 0.7 ? 'strained' : 'steady',
      route: 'decision',
    };
  }

  if (role === 'operator') {
    const company =
      world.entities?.companies?.[state.controlledCompanyId] ??
      Object.values(world.entities?.companies ?? {})[0];
    const utilization = clamp01(company?.operations?.utilization);
    const freeCash = Math.max(
      0,
      finite(company?.cash) - finite(company?.operations?.reservedCash),
    );
    const debt = Math.max(0, finite(company?.debt));
    const cashCover = freeCash / Math.max(1, debt);
    return {
      id: 'responsibility-operator-capacity',
      kind: 'responsibility',
      label: `${company?.shortName ?? '企业'}经营`,
      value: `${Math.round(utilization * 100)}%`,
      actual: utilization,
      ideal: 0.72,
      tension: clamp01(
        Math.abs(utilization - 0.72) * 1.8 +
          Math.max(0, 0.75 - cashCover) * 0.35,
      ),
      tone: cashCover < 0.75 ? 'strained' : 'steady',
      route: 'decision',
    };
  }

  const reserve = Math.max(1, positive(state.liquidityReserveFloor, 1));
  const cashCover = cash / reserve;
  const redemption = clamp01(state.redemptionPressure);
  return {
    id: 'responsibility-institution-liquidity',
    kind: 'responsibility',
    label: '赎回缓冲',
    value: `${cashCover.toFixed(1)}×`,
    actual: cash,
    ideal: reserve,
    tension: clamp01(redemption * 1.5 + Math.max(0, 1 - cashCover) * 0.6),
    tone: redemption > 0.2 || cashCover < 1 ? 'strained' : 'steady',
    route: 'decision',
  };
}

function observableActorNodes(marketSnapshot) {
  const ecology = marketSnapshot?.agentEcology;
  if (ecology?.enabled !== true) return [];
  if (ecology.publication === 'anonymous_aggregate_v1') {
    const latestByGroup = new Map();
    for (const aggregate of Array.isArray(ecology.actionAggregates)
      ? ecology.actionAggregates
      : []) {
      const side = aggregate?.side === 'buy'
        ? 'buy'
        : aggregate?.side === 'sell'
          ? 'sell'
          : '';
      const symbol = String(aggregate?.symbol ?? '').trim();
      const urgency = [
        'aggressive',
        'immediate',
        'resting',
      ].includes(aggregate?.urgency)
        ? aggregate.urgency
        : 'resting';
      const quantityBucket = [
        'micro',
        'small',
        'medium',
        'large',
        'block',
      ].includes(aggregate?.quantityBucket)
        ? aggregate.quantityBucket
        : 'medium';
      const actionCount = Math.max(
        0,
        Math.trunc(finite(aggregate?.actionCount)),
      );
      const participantCount = Math.max(
        0,
        Math.trunc(finite(aggregate?.participantCount)),
      );
      const windowEndMs = Math.max(
        0,
        Math.trunc(finite(aggregate?.windowEndMs)),
      );
      if (
        !side ||
        !symbol ||
        actionCount === 0 ||
        participantCount === 0
      ) {
        continue;
      }
      const key = `${symbol}:${side}:${urgency}:${quantityBucket}`;
      const current = latestByGroup.get(key);
      if (
        current &&
        (current.windowEndMs > windowEndMs ||
          (
            current.windowEndMs === windowEndMs &&
            current.actionCount >= actionCount
          ))
      ) {
        continue;
      }
      latestByGroup.set(key, {
        key,
        symbol,
        side,
        urgency,
        quantityBucket,
        actionCount,
        participantCount,
        windowEndMs,
      });
    }

    const urgencyPrefix = {
      aggressive: '主动',
      immediate: '即时',
      resting: '挂单',
    };
    return [...latestByGroup.values()]
      .sort(
        (left, right) =>
          right.windowEndMs - left.windowEndMs ||
          right.actionCount - left.actionCount ||
          left.key.localeCompare(right.key),
      )
      .slice(0, MAX_OBSERVABLE_ACTORS)
      .map((aggregate, index) => {
        const placement = ACTOR_POSITIONS[index];
        return {
          id: `actor-group-${aggregate.key}`,
          actorId: `group-${aggregate.key}`,
          kind: 'actor',
          label: `${urgencyPrefix[aggregate.urgency]}${
            aggregate.side === 'buy' ? '买盘' : '卖盘'
          }`,
          actorKind: 'market_group',
          symbol: aggregate.symbol,
          side: aggregate.side,
          urgency: aggregate.urgency,
          quantityBucket: aggregate.quantityBucket,
          participantCount: aggregate.participantCount,
          marketDirection: aggregate.side === 'buy' ? 'up' : 'down',
          x: placement.x,
          y: placement.y,
          weight: clamp01(
            0.32 +
              Math.log2(aggregate.actionCount + 1) / 7 +
              Math.log2(aggregate.participantCount + 1) / 12,
          ),
          tension: clamp01(
            (aggregate.urgency === 'aggressive'
              ? 0.32
              : aggregate.urgency === 'immediate'
                ? 0.22
                : 0.1) +
              Math.min(1, aggregate.actionCount / 12) * 0.38,
          ),
          activityCount: aggregate.actionCount,
          acceptedCount: aggregate.actionCount,
          rejectedCount: 0,
          lastActiveMs: aggregate.windowEndMs,
        };
      });
  }

  const agents = ecology.agents ?? {};
  const latestByAgent = new Map();
  for (const activity of ecology.recentActivity ?? []) {
    const agentId = String(activity?.agentId ?? '');
    const agent = agents[agentId];
    const commandCount = Math.max(
      0,
      Math.trunc(finite(activity?.commandCount)),
    );
    if (!agentId || !agent || commandCount === 0) continue;
    const virtualMs = Math.max(
      0,
      Math.trunc(finite(activity?.virtualMs)),
    );
    const current = latestByAgent.get(agentId);
    if (
      current &&
      current.virtualMs > virtualMs
    ) {
      continue;
    }
    latestByAgent.set(agentId, {
      agentId,
      virtualMs,
      commandCount,
      processedCount: Math.max(
        0,
        Math.trunc(finite(activity?.processedCount)),
      ),
      acceptedCount: Math.max(
        0,
        Math.trunc(finite(activity?.acceptedCount)),
      ),
      rejectedCount: Math.max(
        0,
        Math.trunc(finite(activity?.rejectedCount)),
      ),
    });
  }

  return [...latestByAgent.values()]
    .sort(
      (left, right) =>
        right.virtualMs - left.virtualMs ||
        right.commandCount - left.commandCount ||
        right.agentId.localeCompare(left.agentId),
    )
    .slice(0, MAX_OBSERVABLE_ACTORS)
    .map((activity, index) => {
      const agent = agents[activity.agentId];
      const placement = ACTOR_POSITIONS[index];
      const totalResults = Math.max(
        activity.commandCount,
        activity.processedCount,
        activity.acceptedCount + activity.rejectedCount,
      );
      const rejectedShare =
        activity.rejectedCount / Math.max(1, totalResults);
      return {
        id: `actor-${activity.agentId}`,
        actorId: activity.agentId,
        kind: 'actor',
        label: compactText(agent.name ?? '市场主体', 18),
        actorKind: String(agent.kind ?? 'market_participant'),
        x: placement.x,
        y: placement.y,
        weight: clamp01(0.35 + Math.log2(activity.commandCount + 1) / 6),
        tension: clamp01(
          rejectedShare * 0.7 +
            Math.min(1, activity.commandCount / 12) * 0.3,
        ),
        activityCount: activity.commandCount,
        acceptedCount: activity.acceptedCount,
        rejectedCount: activity.rejectedCount,
        lastActiveMs: activity.virtualMs,
      };
    });
}

function relationshipLandmark(nodes) {
  const actor = nodes
    .filter((node) => node.kind === 'actor')
    .sort(
      (left, right) =>
        right.lastActiveMs - left.lastActiveMs ||
        right.activityCount - left.activityCount ||
        left.actorId.localeCompare(right.actorId),
    )[0];
  if (actor) {
    const participantText =
      actor.participantCount > 0
        ? `${actor.participantCount} 方 · `
        : '';
    return {
      id: 'relationship-market-activity',
      kind: 'relationship',
      label: actor.label,
      value: `${participantText}${actor.activityCount} 次`,
      actual: actor.activityCount,
      ideal: null,
      tension: actor.tension,
      tone: actor.rejectedCount > 0 ? 'strained' : 'active',
      route: 'market',
      actorId: actor.actorId,
    };
  }

  const companyNodes = nodes.filter((node) => node.kind === 'company');
  const primary = companyNodes.reduce(
    (current, candidate) =>
      !current || candidate.holdingValue > current.holdingValue
        ? candidate
        : current,
    null,
  );
  return {
    id: 'relationship-portfolio-exposure',
    kind: 'relationship',
    label: primary?.label ?? '市场关系',
    value: `${Math.round((primary?.portfolioShare ?? 0) * 100)}%`,
    actual: primary?.holdingValue ?? 0,
    ideal: null,
    tension: clamp01((primary?.portfolioShare ?? 0) * 1.8),
    tone: (primary?.portfolioShare ?? 0) > 0.5 ? 'strained' : 'active',
    route: 'market',
    symbol: primary?.symbol ?? null,
  };
}

function uncertaintyLandmark(world) {
  const open = (world.clues ?? []).filter(
    (clue) => clue.status !== 'verified',
  );
  const research = Math.max(0, finite(world.player.resources?.research));
  return {
    id: 'uncertainty-open-facts',
    kind: 'uncertainty',
    label: '待查消息',
    value: String(open.length),
    actual: open.length,
    ideal: null,
    tension: clamp01(open.length / Math.max(3, research + 1)),
    tone: open.length > 0 ? 'unknown' : 'steady',
    route: 'information',
  };
}

function worldlineEventLabel(type) {
  const labels = {
    world_created: '世界开市',
    realtime_market_trade: '市场成交',
    world_tick_completed: '经营日结算',
    company_cycle_settled: '企业经营结算',
    company_operating_result: '企业经营变化',
    credit_constraint_settled: '信用约束变化',
    world_terminal_settlement: '世界终局结算',
    role_action: '责任调整',
    player_hold: '保持当前选择',
    order_commitment_recorded: '交易判断归档',
    market_data_activated: '行情服务已开通',
    derivative_settlement: '衍生品清算',
    npc_market_trade: '市场成交',
    market_trade: '市场成交',
    social_career_day_settled: '社会与职业结算',
    company_financing_restructured: '企业融资重组',
  };
  return labels[type] ?? '世界事实更新';
}

const WORLDLINE_TENSION_LABELS = Object.freeze({
  margin_and_settlement_exposure: '保证金与清算结果仍在变化',
  liquidity_and_position_balance: '流动性与持仓平衡仍未定局',
  operating_execution: '企业经营执行仍待后续结算',
  relationship_and_obligation: '关系与责任仍在展开',
  household_obligation: '家庭责任仍需继续履行',
  unverified_information: '尚有信息未被核实',
  decision_consequence: '当前选择的后果仍未完全结算',
  world_path_unresolved: '世界的下一个方向仍由后续事实决定',
});

const WORLDLINE_BRANCH_QUESTIONS = Object.freeze({
  next_clearing_outcome: '下一次清算会如何改变风险暴露？',
  next_settled_order_flow: '下一批真实成交会把流动性推向哪里？',
  next_operating_settlement: '下一次经营结算能否改变当前趋势？',
  next_social_settlement: '下一次关系或责任结算会带来什么变化？',
  next_household_settlement: '下一个家庭结算点能否维持当前安排？',
  next_verification_result: '待核实信息最终会得到什么证据？',
  next_settled_consequence: '当前选择的下一个已结算后果是什么？',
  next_settled_world_change: '哪一个后续事实会再次改变当前阶段？',
});

const WORLDLINE_KNOWN_DATE_LABELS = Object.freeze({
  derivative_clearing: '衍生品清算',
  market_day_settlement: '市场日结',
  company_report: '企业报告',
  social_settlement: '社会与职业结算',
  household_settlement: '家庭结算',
  information_update: '信息更新',
  decision_review: '选择复盘',
  world_day_settlement: '世界日结',
  repayment_review: '偿付复核',
});

function worldlineTensionLabel(code) {
  return (
    WORLDLINE_TENSION_LABELS[code] ??
    '仍有一项未决事实需要后续结算'
  );
}

function worldlineQuestion(code) {
  return (
    WORLDLINE_BRANCH_QUESTIONS[code] ??
    '后续已结算事实会如何改变当前路径？'
  );
}

function worldlineKnownDate(entry) {
  if (!Number.isSafeInteger(entry?.atMs)) return null;
  const day = Math.floor(entry.atMs / 86_400_000) + 1;
  const label =
    WORLDLINE_KNOWN_DATE_LABELS[entry.kind] ??
    '已知结算点';
  return `第 ${day} 日·${label}`;
}

function worldlineEntityLabel(world, entityId) {
  if (entityId === 'player') return world.player.roleLabel;
  const company = world.entities?.companies?.[entityId];
  if (company) return company.shortName ?? company.name;
  const investor = world.entities?.investors?.[entityId];
  if (investor) return investor.name ?? '市场参与者';
  if (entityId === 'world_system') return '世界运行';
  if (entityId === world.market?.venue) return world.market.venue;
  return '世界关系';
}

function projectWorldline(world) {
  const worldline = world.worldline;
  if (!worldline?.anchors || !worldline?.arcs) {
    return {
      status: '等待事实',
      anchors: [],
      totalSettledEvents: 0,
      activeArcs: [],
      terminalArcCount: 0,
    };
  }
  const phaseLabel = {
    before_open: '开市前',
    morning: '上午盘',
    midday: '午间',
    afternoon: '下午盘',
    after_close: '收市后',
  }[worldline.anchors.session.phase] ?? '当前时段';
  const momentSequence =
    worldline.anchors.moment.sequence ?? 0;
  const activeArcs = (worldline.activeArcIds ?? [])
    .map((arcId) => worldline.arcs[arcId])
    .filter(Boolean)
    .map((arc) => {
      const entityLabels = (arc.focusEntityIds ?? [])
        .map((entityId) =>
          worldlineEntityLabel(world, entityId),
        )
        .filter(
          (label, index, values) =>
            values.indexOf(label) === index,
        )
        .slice(0, 2);
      return {
        title:
          entityLabels.join('·') || '世界关系',
        status: '继续演化',
        latestChange: worldlineEventLabel(
          arc.latestEventType,
        ),
        settledEventCount: arc.settledEventCount,
        constraintCount:
          arc.constraintCodes?.length ?? 0,
        branchCount: arc.childArcIds?.length ?? 0,
        dominant:
          worldline.dominantArcIds?.includes(arc.id) ??
          false,
        unresolvedTensions: (
          arc.unresolvedTensions ?? []
        ).map(worldlineTensionLabel),
        resourceConstraintCount:
          arc.resourceConstraints?.length ?? 0,
        branchingQuestions: (
          arc.branchingConditions ?? []
        ).map(worldlineQuestion),
        nextKnownDate: worldlineKnownDate(
          arc.nextKnownDates?.[0],
        ),
      };
    });
  const dominantArcs = activeArcs.filter(
    (arc) => arc.dominant,
  );
  const primaryArc =
    dominantArcs[0] ?? activeArcs[0] ?? null;
  const recentTransition =
    worldline.recentTransitions?.at(-1) ?? null;
  const nextKnownDate = [
    ...dominantArcs,
    ...activeArcs.filter((arc) => !arc.dominant),
  ].find((arc) => arc.nextKnownDate)?.nextKnownDate ?? null;
  const openQuestion = [
    ...dominantArcs,
    ...activeArcs.filter((arc) => !arc.dominant),
  ].flatMap((arc) => arc.branchingQuestions)[0] ??
    '当前没有额外的已知分叉条件。';
  return {
    status:
      worldline.status === 'terminal'
        ? '已定局'
        : '演化中',
    anchors: [
      {
        label: '时刻',
        value: `第 ${momentSequence} 次已结算变化`,
      },
      { label: '时段', value: phaseLabel },
      {
        label: '世界日',
        value: `第 ${worldline.anchors.day.index} 日`,
      },
      {
        label: '周',
        value: `第 ${worldline.anchors.week.index} 周`,
      },
      {
        label: '季',
        value: `第 ${worldline.anchors.quarter.index} 季`,
      },
      {
        label: '时代',
        value: `第 ${worldline.anchors.era.index} 阶段`,
      },
    ],
    totalSettledEvents: worldline.totalSettledEvents,
    activeArcs,
    dominantArcs,
    currentStage:
      `第 ${worldline.anchors.day.index} 日 · ${phaseLabel}`,
    recentTurningPoint: recentTransition
      ? worldlineEventLabel(recentTransition.eventType)
      : '世界开市',
    whyChanged: primaryArc
      ? `${primaryArc.title}的${primaryArc.latestChange}改变了当前路径。`
      : '尚无新的已结算事实改变当前路径。',
    nextKnownDate:
      nextKnownDate ?? '尚无公开的已知日期',
    openQuestion,
    terminalArcCount:
      worldline.terminalArcIds?.length ?? 0,
  };
}

function listingBoardLabel(security) {
  const exchange = security?.listingIdentity?.exchange;
  const board = security?.listingIdentity?.board;
  if (board === 'STAR') return '科创板';
  if (board === 'CHINEXT') return '创业板';
  if (exchange === 'SZSE') return '深证主板';
  return '上证主板';
}

function listingRiskLabel(security) {
  const risk =
    security?.listingIdentity?.riskDesignation ??
    security?.riskDesignation;
  if (risk === 'STAR_ST') return '*ST';
  if (risk === 'ST') return 'ST';
  return '';
}

function companyOverviewRows(world, marketSnapshot, positions) {
  return positions.map((position) => {
    const security =
      world.market.securities[position.symbol];
    const marketSecurity =
      marketSnapshot?.symbols?.[position.symbol] ?? {};
    const deltaBps = Number.isFinite(
      Number(marketSecurity.changeBps),
    )
      ? Math.round(Number(marketSecurity.changeBps))
      : Math.round(
          (position.lastTicks - position.previousTicks) *
            10_000 /
            Math.max(1, position.previousTicks),
        );
    const signal =
      world.economy?.businessNetwork
        ?.lastSignalsByCompany?.[
          position.company.id
        ] ?? {};
    const signalValues = [
      signal.demandBps,
      signal.inputAvailabilityBps,
      signal.unitCostBps,
      signal.collectionBps,
      signal.fundingAvailabilityBps,
      signal.fundingCostBps,
      signal.investmentIncomeBps,
    ].map((value) => finite(value, 10_000));
    const networkDeviationBps = Math.max(
      0,
      ...signalValues.map((value) =>
        Math.abs(value - 10_000),
      ),
    );
    const latestNotice =
      world.economy?.adaptiveWorldEvents
        ?.latestByCompany?.[
          position.company.id
        ] ?? null;
    return {
      companyId: position.company.id,
      symbol: position.symbol,
      displayCode:
        security.displayCode ??
        security.listingIdentity?.displayCode ??
        position.symbol,
      companyName:
        position.company.shortName ??
        position.company.name ??
        position.symbol,
      fullName:
        position.company.name ?? position.symbol,
      industry:
        position.company.industry ??
        position.company.role ??
        '综合行业',
      boardLabel: listingBoardLabel(security),
      riskLabel: listingRiskLabel(security),
      lastPriceTicks: position.lastTicks,
      deltaBps,
      direction:
        deltaBps > 0
          ? 'up'
          : deltaBps < 0
            ? 'down'
            : 'flat',
      marketCapCents:
        position.lastTicks *
        Math.max(
          0,
          Math.trunc(finite(security.outstandingUnits)),
        ),
      sessionVolumeShares: Math.max(
        0,
        Math.trunc(
          finite(marketSecurity.sessionVolumeShares),
        ),
      ),
      sessionTurnoverCents: Math.max(
        0,
        Math.trunc(
          finite(marketSecurity.sessionTurnoverCents),
        ),
      ),
      atLimitUp:
        position.lastTicks ===
        Math.trunc(finite(marketSecurity.limitUpTicks, -1)),
      atLimitDown:
        position.lastTicks ===
        Math.trunc(finite(marketSecurity.limitDownTicks, -1)),
      holdingUnits: position.quantity,
      holdingValue: position.holdingValue,
      networkDeviationBps,
      networkCauseCount:
        signal.causes?.length ?? 0,
      latestNoticeKind:
        latestNotice?.kind ?? null,
      tradeRoute: 'market',
      informationRoute: 'information',
    };
  });
}

function marketOverview(companyRows) {
  const advancers = companyRows.filter(
    (company) => company.deltaBps > 0,
  ).length;
  const decliners = companyRows.filter(
    (company) => company.deltaBps < 0,
  ).length;
  const totalTurnoverCents = companyRows.reduce(
    (sum, company) =>
      sum + company.sessionTurnoverCents,
    0,
  );
  const topMovers = [...companyRows]
    .sort(
      (left, right) =>
        Math.abs(right.deltaBps) -
          Math.abs(left.deltaBps) ||
        right.sessionTurnoverCents -
          left.sessionTurnoverCents ||
        left.symbol.localeCompare(right.symbol),
    )
    .slice(0, 8);
  return {
    listedCount: companyRows.length,
    advancers,
    decliners,
    unchanged:
      companyRows.length - advancers - decliners,
    limitUpCount: companyRows.filter(
      (company) => company.atLimitUp,
    ).length,
    limitDownCount: companyRows.filter(
      (company) => company.atLimitDown,
    ).length,
    totalTurnoverCents,
    topMovers,
  };
}

function economyOverview(world) {
  const economy = world.economy ?? {};
  const regimeLabels = {
    balanced_expansion: '均衡扩张',
    productivity_acceleration: '生产率加速',
    demand_rebalancing: '需求再平衡',
    credit_repricing: '信用重定价',
    structural_transition: '结构转型',
  };
  return {
    regime:
      regimeLabels[economy.regime] ??
      '结构演化中',
    industrialCycle: finite(economy.industrialCycle),
    developmentIndex: finite(economy.developmentIndex, 1),
    technologyFrontier: finite(economy.technologyFrontier, 1),
    potentialDemandIndex: finite(economy.potentialDemandIndex, 1),
    priceLevel: finite(economy.priceLevel, 1),
    riskFreeRateBps: Math.round(
      finite(economy.riskFreeRateBps),
    ),
    creditSpreadBps: Math.round(
      finite(economy.creditSpreadBps),
    ),
  };
}

function businessNetworkOverview(world, companyRows) {
  const network =
    world.economy?.businessNetwork ?? {};
  const companyById = new Map(
    companyRows.map((company) => [
      company.companyId,
      company,
    ]),
  );
  const pressures = companyRows
    .filter(
      (company) =>
        company.networkDeviationBps > 0 ||
        company.latestNoticeKind,
    )
    .sort(
      (left, right) =>
        right.networkDeviationBps -
          left.networkDeviationBps ||
        left.symbol.localeCompare(right.symbol),
    )
    .slice(0, 8)
    .map((company) => {
      const signal =
        network.lastSignalsByCompany?.[
          company.companyId
        ] ?? {};
      const leadingCause = [...(signal.causes ?? [])]
        .sort(
          (left, right) =>
            Math.abs(right.impactBps) -
            Math.abs(left.impactBps),
        )[0];
      return {
        companyId: company.companyId,
        symbol: company.symbol,
        companyName: company.companyName,
        deviationBps: company.networkDeviationBps,
        causeCount: company.networkCauseCount,
        counterpartyName: leadingCause
          ? companyById.get(
              leadingCause.counterpartyCompanyId,
            )?.companyName ?? '关联经营方'
          : null,
        relationship:
          leadingCause?.relationship ?? null,
        impactBps:
          leadingCause?.impactBps ?? 0,
        informationRoute: 'information',
      };
    });
  return {
    contractVersion:
      network.contractVersion ?? null,
    edgeCount: network.edges?.length ?? 0,
    lastSettledTick:
      network.lastSettledTick ?? 0,
    pressures,
  };
}

function derivativesOverview(world) {
  const derivatives = world.derivatives ?? {};
  const futures =
    derivatives.universe?.futures ?? {};
  const options =
    derivatives.universe?.options ?? {};
  const trades =
    derivatives.market?.trades ?? [];
  const permissionModes =
    derivatives.access?.permissionModes ?? {};
  return {
    futuresCount: Object.keys(futures).length,
    optionsCount: Object.keys(options).length,
    actorCount: Object.keys(
      derivatives.actors ?? {},
    ).length,
    liveBookCount: Object.keys(
      derivatives.books ?? {},
    ).length,
    tradeCount: trades.length,
    activePermissionCount: Object.values(
      permissionModes,
    ).filter(
      (mode) =>
        mode === 'FULL' || mode === 'BUY_ONLY',
    ).length,
    totalPermissionCount: Object.keys(
      permissionModes,
    ).length,
    regimeSignalBps: Math.round(
      finite(
        derivatives.market?.regimeSignalBps,
      ),
    ),
    jumpRiskBps: Math.round(
      finite(derivatives.market?.jumpRiskBps),
    ),
    liquidityRiskBps: Math.round(
      finite(
        derivatives.market?.liquidityRiskBps,
      ),
    ),
    route: 'market',
  };
}

function worldBriefing(world, maximum = 8) {
  const facts = (world.facts ?? [])
    .filter((fact) => fact.visibility === 'public')
    .map((fact) => ({
      id: `briefing-fact-${fact.id}`,
      tick: Math.max(0, Math.trunc(finite(fact.tick))),
      priority:
        String(fact.type).includes('announcement') ||
        String(fact.type).includes('notice')
          ? 3
          : 2,
      category:
        String(fact.type).includes('announcement') ||
        String(fact.type).includes('notice')
          ? '公告'
          : '事实',
      title: compactText(
        publicSignalText(fact.summary),
        72,
      ),
      sourceLabel: '世界公开事实',
      companyId: fact.entityId ?? null,
      route: {
        page: 'company',
        companyId: fact.entityId ?? null,
        section: 'disclosures',
      },
    }));
  const clues = (world.clues ?? [])
    .filter((clue) => clue.status !== 'verified')
    .map((clue) => ({
      id: `briefing-clue-${clue.id}`,
      tick: Math.max(
        0,
        Math.trunc(finite(clue.publishedTick)),
      ),
      priority: 1,
      category: '待查',
      title: compactText(clue.title, 72),
      sourceLabel:
        String(clue.source ?? '经营线索'),
      companyId: clue.companyId ?? null,
      route: {
        page: 'company',
        companyId: clue.companyId ?? null,
        section: 'clues',
      },
    }));
  return [...facts, ...clues]
    .sort(
      (left, right) =>
        right.tick - left.tick ||
        right.priority - left.priority ||
        right.id.localeCompare(left.id),
    )
    .slice(0, maximum);
}

function projectWorldOverview(
  world,
  marketSnapshot,
  positions,
) {
  const companies = companyOverviewRows(
    world,
    marketSnapshot,
    positions,
  );
  return {
    market: marketOverview(companies),
    economy: economyOverview(world),
    businessNetwork:
      businessNetworkOverview(world, companies),
    derivatives: derivativesOverview(world),
    briefing: worldBriefing(world),
    companies,
  };
}

export function projectWorldExperience(
  world,
  marketSnapshot = null,
  options = {},
) {
  if (!world?.world?.id || !world?.player?.id) {
    throw new TypeError('A complete authoritative world is required.');
  }

  const symbols = Object.keys(world.market?.securities ?? {}).sort();
  const positions = symbols.map((symbol) => {
    const security = world.market.securities[symbol];
    const company = world.entities?.companies?.[security.issuerId] ?? {};
    const marketSecurity = marketSnapshot?.symbols?.[symbol];
    const lastTicks = priceTicks(security, marketSecurity);
    const previousTicks = previousCloseTicks(
      security,
      marketSecurity,
      lastTicks,
    );
    const quantity = Math.max(
      0,
      Math.trunc(finite(world.player.holdings?.[symbol])),
    );
    return {
      symbol,
      company,
      lastTicks,
      previousTicks,
      quantity,
      holdingValue: quantity * lastTicks / 100,
    };
  });
  const portfolioValue = positions.reduce(
    (sum, position) => sum + position.holdingValue,
    0,
  );
  const nodes = [
    {
      id: 'player',
      kind: 'player',
      label: world.player.roleLabel,
      x: 50,
      y: 50,
      weight: 1,
      tension: 0,
    },
    ...positions.map((position, index) => {
      const deltaBps = Math.round(
        (
          (position.lastTicks - position.previousTicks) /
          position.previousTicks
        ) * 10_000,
      );
      const portfolioShare =
        position.holdingValue / Math.max(1, portfolioValue);
      const companyDebt = Math.max(0, finite(position.company.debt));
      const companyCash = Math.max(1, positive(position.company.cash, 1));
      const financialStress = clamp01(companyDebt / companyCash / 2);
      const placement = NODE_POSITIONS[index % NODE_POSITIONS.length];
      return {
        id: position.company.id ?? position.symbol,
        kind: 'company',
        symbol: position.symbol,
        label: position.company.shortName ?? position.symbol,
        role: position.company.role ?? '',
        x: placement.x,
        y: placement.y,
        weight: clamp01(0.35 + portfolioShare),
        holdingUnits: position.quantity,
        holdingValue: position.holdingValue,
        portfolioShare,
        lastPriceTicks: position.lastTicks,
        deltaBps,
        tension: clamp01(
          Math.abs(deltaBps) / 2_000 * 0.55 + financialStress * 0.45,
        ),
      };
    }),
    ...observableActorNodes(marketSnapshot),
  ];

  const cash = Math.max(0, finite(world.player.cash));
  const otherAssets = Math.max(0, finite(world.player.otherAssets));
  const liabilities = Math.max(0, finite(world.player.liabilities));
  const landmarks = [
    roleResponsibility(world, marketSnapshot),
    relationshipLandmark(nodes),
    uncertaintyLandmark(world),
  ];
  const nowMs = Math.max(0, Math.trunc(finite(marketSnapshot?.nowMs)));

  return {
    clock: {
      virtualMs: nowMs,
      dayProgress: (nowMs % WORLD_DAY_MS) / WORLD_DAY_MS,
      worldTick: Math.max(0, Math.trunc(finite(world.world.tick))),
      year: Math.max(
        1,
        Math.trunc(finite(world.world.calendar?.year, 1)),
      ),
      day: Math.max(
        1,
        Math.trunc(finite(world.world.calendar?.day, 1)),
      ),
    },
    identity: {
      id: world.player.id,
      roleType: world.player.roleType,
      label: world.player.roleLabel,
      profile: world.player.profileName,
    },
    capital: {
      cash,
      portfolioValue,
      otherAssets,
      liabilities,
      netAssets: cash + portfolioValue + otherAssets - liabilities,
    },
    nodes,
    landmarks,
    overview: projectWorldOverview(
      world,
      marketSnapshot,
      positions,
    ),
    worldline: projectWorldline(world),
    signals:
      options.includeSignals === false
        ? []
        : latestSignals(
            world,
            Math.min(3, Math.max(0, options.maximumSignals ?? 3)),
          ),
    controlsSuggested: false,
  };
}
