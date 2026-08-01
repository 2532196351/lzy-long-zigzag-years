const ACTIONS = new Set([
  'contact',
  'visit',
  'exchange',
  'gift',
  'hire',
  'cooperate',
  'challenge',
  'build_capability',
  'borrow',
  'repay',
  'bid_opportunity',
]);

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function validId(value) {
  const id = String(value ?? '').trim();
  return id.length > 0 && id.length <= 96 ? id : null;
}

function finiteAmount(value, minimum, maximum) {
  const amount = Number(value);
  return Number.isFinite(amount) &&
    amount >= minimum &&
    amount <= maximum
    ? Math.round(amount * 100) / 100
    : null;
}

function money(value) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function relationTone(relation) {
  if (relation.conflict >= 45) return '紧张';
  if (relation.trust >= 65) return '信得过';
  if (relation.familiarity >= 55) return '熟悉';
  if (relation.familiarity >= 25) return '认识';
  return '不熟';
}

function capabilityLabel(capability) {
  return {
    craft: '动手能力',
    research: '调查判断',
    delivery: '组织交付',
    sales: '客户沟通',
  }[capability] ?? '经营能力';
}

function availabilityLabel(person) {
  const status = person.availability?.status;
  return {
    working: '在岗',
    busy: '忙碌',
    resting: '休息',
    off_shift: '不当班',
    between_jobs: '待业',
    unavailable: '暂不可用',
    available: person.available ? '可联系' : '正忙',
  }[status] ?? (person.available ? '可联系' : '正忙');
}

function moodLabel(value) {
  const mood = Number(value) || 0;
  if (mood <= -0.55) return '心情低落';
  if (mood <= -0.2) return '有些疲惫';
  if (mood >= 0.55) return '兴致很好';
  if (mood >= 0.2) return '状态不错';
  return '状态平稳';
}

function scheduleLabel(schedule) {
  const days = Array.isArray(schedule?.workDays)
    ? schedule.workDays
    : [];
  if (days.length === 0) return '按约安排';
  const weekday =
    days.length === 5 &&
    days.every((day, index) => day === index + 1)
      ? '周一至周五'
      : `每周${days.length}天`;
  const start = Number(schedule?.shiftStartHour);
  const end = Number(schedule?.shiftEndHour);
  return Number.isFinite(start) && Number.isFinite(end)
    ? `${weekday} ${String(start).padStart(2, '0')}:00—${String(end).padStart(2, '0')}:00`
    : weekday;
}

function renderPlaces(projection) {
  return `
    <section class="social-place-panel" data-testid="social-place-list">
      <header>
        <strong>街区去处</strong>
        <span>${projection.places.length} 处</span>
      </header>
      <div class="social-place-grid">
        ${projection.places
          .map(
            (place) => `
              <button type="button" class="social-place-button"
                data-action="social-career-action"
                data-social-command="visit"
                data-social-location="${escapeHtml(place.id)}">
                <strong>${escapeHtml(place.name)}</strong>
                <span>${
                  place.peopleNames.length > 0
                    ? escapeHtml(place.peopleNames.slice(0, 3).join('、'))
                    : '现在很安静'
                }</span>
                <small>${place.activityCount} 人在这里</small>
              </button>
            `,
          )
          .join('')}
      </div>
    </section>
  `;
}

function renderPerson(person) {
  return `
    <article class="social-person-card">
      <header>
        <div>
          <strong>${escapeHtml(person.name)}</strong>
          <span>${escapeHtml(person.occupation)}</span>
        </div>
        <small data-tone="${escapeHtml(relationTone(person.relation))}">
          ${escapeHtml(relationTone(person.relation))}
        </small>
      </header>
      <p>${escapeHtml(person.identity)}</p>
      <dl>
        <div><dt>现在</dt><dd>${escapeHtml(person.currentActivity)}</dd></div>
        <div><dt>地点</dt><dd>${escapeHtml(person.location)}</dd></div>
        <div><dt>工作</dt><dd>${escapeHtml(person.workplace)}</dd></div>
        <div><dt>安排</dt><dd><span>今日安排</span> ${escapeHtml(availabilityLabel(person))} · ${escapeHtml(scheduleLabel(person.schedule))}</dd></div>
        <div><dt>状态</dt><dd>${escapeHtml(moodLabel(person.mood))}</dd></div>
      </dl>
      <div class="social-relation-strip" aria-label="你们的关系">
        <span>信任 <b>${Math.round(person.relation.trust)}</b></span>
        <span>熟悉 <b>${Math.round(person.relation.familiarity)}</b></span>
        <span>分歧 <b>${Math.round(person.relation.conflict)}</b></span>
      </div>
      <div class="social-primary-actions">
        <button type="button" data-action="social-career-action"
          data-social-command="contact"
          data-social-actor="${escapeHtml(person.id)}">联系</button>
        <button type="button" data-action="social-career-action"
          data-social-command="cooperate"
          data-social-actor="${escapeHtml(person.id)}">合作</button>
      </div>
      <details class="social-more-actions">
        <summary>更多来往</summary>
        <div>
          <button type="button" data-action="social-career-action"
            data-social-command="exchange"
            data-social-amount="600"
            data-social-actor="${escapeHtml(person.id)}">换条线索</button>
          <button type="button" data-action="social-career-action"
            data-social-command="gift"
            data-social-amount="300"
            data-social-actor="${escapeHtml(person.id)}">送份心意</button>
          <button type="button" data-action="social-career-action"
            data-social-command="hire"
            data-social-amount="1400"
            data-social-actor="${escapeHtml(person.id)}">雇用</button>
          <button type="button" data-action="social-career-action"
            data-social-command="challenge"
            data-social-actor="${escapeHtml(person.id)}">正面竞争</button>
        </div>
      </details>
    </article>
  `;
}

function renderPeople(projection) {
  return `
    <section class="social-people-panel" data-testid="social-people-list">
      <header>
        <strong>附近的人</strong>
        <span>${projection.people.length} 人</span>
      </header>
      <div class="social-people-grid">
        ${projection.people.map(renderPerson).join('')}
      </div>
    </section>
  `;
}

function researchServiceLabel(research) {
  if (!research?.active) return '未签约';
  if (research.lead?.available) return '在岗';
  return {
    substitute_available: '替补跟进',
    public_only: '仅公开资料',
    awaiting_shift: '等待当班',
    paused: '暂停更新',
  }[research.status] ?? '暂不可用';
}

function renderResearchCoverage(projection) {
  const research = projection.research;
  if (!research) return '';
  const freshCount = research.coverage.filter(
    (entry) => entry.status === 'fresh',
  ).length;
  const staleCount = research.coverage.filter(
    (entry) => entry.status === 'stale',
  ).length;
  const serviceLabel = researchServiceLabel(research);
  return `
    <section class="social-research-panel" data-testid="social-research-coverage">
      <header>
        <div>
          <strong>公司研究</strong>
          <span>${escapeHtml(research.lead.name)} · ${escapeHtml(serviceLabel)}</span>
        </div>
        <b data-state="${escapeHtml(serviceLabel)}">${freshCount} 份已更新</b>
      </header>
      <p>公开公告与行情仍可查看；内部更新取决于覆盖人员当日工作。</p>
      <div class="social-research-summary">
        <span>新鲜 <b>${freshCount}</b></span>
        <span>待复核 <b>${staleCount}</b></span>
        <span>仅公开 <b>${research.coverage.length - freshCount - staleCount}</b></span>
      </div>
      <div class="social-research-symbols" aria-label="研究覆盖">
        ${research.coverage
          .map(
            (entry) => `
              <span data-state="${escapeHtml(
                {
                  fresh: 'current',
                  stale: 'review',
                  public_only: 'public',
                }[entry.status] ?? 'public',
              )}">
                ${escapeHtml(entry.symbol)}
              </span>
            `,
          )
          .join('')}
      </div>
    </section>
  `;
}

function renderVenture(projection) {
  const venture = projection.playerOrganization;
  if (!venture) return '';
  const capabilityEntries = Object.entries(venture.capabilities);
  const weakest = capabilityEntries.sort(
    (left, right) =>
      Number(left[1]) - Number(right[1]) ||
      left[0].localeCompare(right[0]),
  )[0];
  return `
    <section class="social-venture-card" data-testid="social-venture">
      <header>
        <div>
          <small>你的事业</small>
          <strong>${escapeHtml(venture.name)}</strong>
        </div>
        <span>${escapeHtml(venture.objective)}</span>
      </header>
      <div class="social-venture-numbers">
        <span>现金 <b>${money(venture.cash)}</b></span>
        <span>负债 <b>${money(venture.debtPrincipal)}</b></span>
        <span>人手 <b>${venture.staffCount}/${venture.capacity}</b></span>
        <span>已交付 <b>${venture.completedContracts}</b></span>
      </div>
      <div class="social-capabilities">
        ${capabilityEntries
          .map(
            ([key, value]) => `
              <span>
                ${escapeHtml(capabilityLabel(key))}
                <b>${Math.round(Number(value) * 100)}</b>
              </span>
            `,
          )
          .join('')}
      </div>
      <button type="button" class="social-main-business-action"
        data-action="social-career-action"
        data-social-command="build_capability"
        data-social-capability="${escapeHtml(weakest[0])}"
        data-social-amount="5000">
        补强${escapeHtml(capabilityLabel(weakest[0]))} · ${money(5_000)}
      </button>
      <details class="social-more-actions">
        <summary>周转与责任</summary>
        <div>
          <button type="button" data-action="social-career-action"
            data-social-command="borrow"
            data-social-amount="20000">借入 ${money(20_000)}</button>
          <button type="button" data-action="social-career-action"
            data-social-command="repay"
            data-social-amount="5000">归还 ${money(5_000)}</button>
        </div>
      </details>
    </section>
  `;
}

function renderOpportunities(projection) {
  return `
    <section class="social-opportunity-panel" data-testid="social-opportunities">
      <header>
        <strong>可谈的事</strong>
        <span>${projection.opportunities.length} 件</span>
      </header>
      <div>
        ${
          projection.opportunities.length === 0
            ? '<p class="social-empty">眼下没有空着的机会。</p>'
            : projection.opportunities
                .map(
                  (opportunity) => `
                    <article>
                      <div>
                        <strong>${escapeHtml(opportunity.client)}</strong>
                        <span>${escapeHtml(opportunity.need)} · ${escapeHtml(
                          opportunity.location,
                        )}</span>
                      </div>
                      <span>${money(opportunity.reward)}</span>
                      <button type="button" data-action="social-career-action"
                        data-social-command="bid_opportunity"
                        data-social-opportunity="${escapeHtml(
                          opportunity.id,
                        )}">接洽</button>
                    </article>
                  `,
                )
                .join('')
        }
      </div>
    </section>
  `;
}

function renderHistory(projection) {
  return `
    <section class="social-history-panel" data-testid="social-history">
      <header>
        <strong>最近发生</strong>
        <span>第 ${projection.asOfTick} 日</span>
      </header>
      <ol>
        ${projection.history
          .slice(0, 6)
          .map(
            (entry) => `
              <li>
                <span>第 ${entry.tick} 日</span>
                <p>${escapeHtml(entry.text)}</p>
              </li>
            `,
          )
          .join('')}
      </ol>
    </section>
  `;
}

export function renderSocialCareerView(projection) {
  if (
    !projection ||
    projection.schemaVersion !== 'lzy-social-career-public-v1'
  ) {
    return '';
  }
  return `
    <section class="social-career-shell" data-testid="social-career-view">
      <header class="social-career-head">
        <div>
          <small>工作</small>
          <strong>人脉与事业</strong>
        </div>
        <span>${projection.people.length} 人 · ${projection.places.length} 处去处</span>
      </header>
      <div class="social-career-layout">
        <div class="social-career-main">
          ${renderPlaces(projection)}
          ${renderPeople(projection)}
        </div>
        <aside class="social-career-side">
          ${renderResearchCoverage(projection)}
          ${renderVenture(projection)}
          ${renderOpportunities(projection)}
          ${renderHistory(projection)}
        </aside>
      </div>
    </section>
  `;
}

export function socialCareerActionFromDataset(dataset = {}) {
  const command = String(dataset.socialCommand ?? '');
  if (!ACTIONS.has(command)) return null;
  const action = {
    type: 'social_action',
    command,
  };
  if (
    ['contact', 'exchange', 'gift', 'hire', 'cooperate', 'challenge'].includes(
      command,
    )
  ) {
    const targetActorId = validId(dataset.socialActor);
    if (!targetActorId) return null;
    action.targetActorId = targetActorId;
  }
  if (command === 'visit') {
    const locationId = validId(dataset.socialLocation);
    if (!locationId) return null;
    action.locationId = locationId;
  }
  if (command === 'exchange') {
    const offerAmount = finiteAmount(dataset.socialAmount, 1, 50_000);
    if (offerAmount === null) return null;
    action.offerAmount = offerAmount;
    action.requested = 'opportunity_lead';
  }
  if (command === 'gift') {
    const amount = finiteAmount(dataset.socialAmount, 1, 10_000);
    if (amount === null) return null;
    action.amount = amount;
  }
  if (command === 'hire') {
    const offeredWage = finiteAmount(dataset.socialAmount, 500, 20_000);
    if (offeredWage === null) return null;
    action.offeredWage = offeredWage;
  }
  if (command === 'build_capability') {
    const capability = String(dataset.socialCapability ?? '');
    const amount = finiteAmount(dataset.socialAmount, 1_000, 100_000);
    if (
      !['craft', 'research', 'delivery', 'sales'].includes(capability) ||
      amount === null
    ) {
      return null;
    }
    action.capability = capability;
    action.amount = amount;
  }
  if (['borrow', 'repay'].includes(command)) {
    const amount = finiteAmount(
      dataset.socialAmount,
      command === 'borrow' ? 1_000 : 1,
      200_000,
    );
    if (amount === null) return null;
    action.amount = amount;
  }
  if (command === 'bid_opportunity') {
    const opportunityId = validId(dataset.socialOpportunity);
    if (!opportunityId) return null;
    action.opportunityId = opportunityId;
  }
  return action;
}
