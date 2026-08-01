function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

const ANCHOR_KEYS = Object.freeze([
  'moment',
  'session',
  'day',
  'week',
  'quarter',
  'era',
]);

export function renderWorldlinePanel(
  projection,
  { variant = 'today' } = {},
) {
  const anchors = Array.isArray(projection?.anchors)
    ? projection.anchors.slice(0, ANCHOR_KEYS.length)
    : [];
  const activeArcs = Array.isArray(
    projection?.activeArcs,
  )
    ? projection.activeArcs
    : [];
  const anchorMarkup = anchors
    .map(
      (anchor, index) => `
        <span data-worldline-anchor="${ANCHOR_KEYS[index]}">
          <small>${escapeHtml(anchor.label)}</small>
          <strong>${escapeHtml(anchor.value)}</strong>
        </span>`,
    )
    .join('');
  const arcMarkup = activeArcs.length
    ? activeArcs
        .map(
          (arc) => `
            <article class="worldline-arc">
              <header>
                <strong>${escapeHtml(arc.title)}</strong>
                <small>${escapeHtml(arc.status)}</small>
              </header>
              <p>${escapeHtml(arc.latestChange)}</p>
              <div>
                <span>${Math.max(
                  0,
                  Number(arc.settledEventCount) || 0,
                )} 次已结算变化</span>
                <span>${Math.max(
                  0,
                  Number(arc.branchCount) || 0,
                )} 个分支</span>
                <span>约束 ${Math.max(
                  0,
                  Number(arc.constraintCount) || 0,
                )} 项</span>
              </div>
            </article>`,
        )
        .join('')
    : `
        <p class="worldline-empty">当前还没有可展开的已结算路径。</p>
      `;
  const terminalMarkup =
    variant === 'history'
      ? `<span class="worldline-terminal-count">${Math.max(
          0,
          Number(projection?.terminalArcCount) || 0,
        )} 条已定局路径</span>`
      : '';
  return `
    <section class="worldline-panel worldline-panel--${
      variant === 'history' ? 'history' : 'today'
    }" data-testid="worldline-panel"
      data-worldline-status="${escapeHtml(
        projection?.status ?? '等待事实',
      )}">
      <header>
        <span><small>当前世界线</small><strong>${escapeHtml(
          projection?.status ?? '等待事实',
        )}</strong></span>
        <span>${Math.max(
          0,
          Number(projection?.totalSettledEvents) || 0,
        )} 次事实结算</span>
        ${terminalMarkup}
      </header>
      <div class="worldline-anchors">
        ${anchorMarkup}
      </div>
      <div class="worldline-grounding">
        <span><small>当前阶段</small><strong>${escapeHtml(
          projection?.currentStage ?? '等待事实',
        )}</strong></span>
        <span><small>最近转折</small><strong>${escapeHtml(
          projection?.recentTurningPoint ?? '尚无新转折',
        )}</strong></span>
        <span><small>为什么改变</small><strong>${escapeHtml(
          projection?.whyChanged ?? '尚无新的已结算变化。',
        )}</strong></span>
        <span><small>下一已知日期</small><strong>${escapeHtml(
          projection?.nextKnownDate ?? '尚无公开日期',
        )}</strong></span>
        <span><small>仍未知</small><strong>${escapeHtml(
          projection?.openQuestion ?? '后续事实将继续决定路径。',
        )}</strong></span>
      </div>
      <div class="worldline-arcs">
        ${arcMarkup}
      </div>
    </section>
  `;
}
