function escapeText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function compactNumber(value) {
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 1,
  }).format(Number(value) || 0);
}

function currency(value) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

const placeServiceLabels = Object.freeze({
  living: '起居',
  storage: '存放',
  parking: '停车',
  carried: '随身',
  retail: '购买',
  resale: '出售',
  trade_in: '置换',
  health: '医疗',
  education: '课程',
  entertainment: '休闲',
  mobility: '交通',
  maintenance: '维修',
  professional_work: '专业工作',
  client_appointments: '客户预约',
  operations: '现场经营',
  staff: '人员',
  issue: '领用',
  dealing: '交易',
  risk: '风控',
  client_service: '客户服务',
  archive: '档案',
});

export function renderCityPlaceGrid(life) {
  return `
    <section class="city-place-panel" aria-labelledby="city-place-title">
      <header>
        <div>
          <small>城市地点</small>
          <strong id="city-place-title">附近去处</strong>
        </div>
        <span>${compactNumber(life.places.length)} 处</span>
      </header>
      <div class="city-place-grid" data-testid="city-place-grid">
        ${life.places
          .map(
            (place) => `
              <article class="city-place-card" data-city-place="${escapeText(
                place.kind,
              )}">
                <img src="${escapeText(place.image)}"
                  alt="${escapeText(place.label)}"
                  width="768" height="768"
                  loading="lazy" decoding="async" />
                <div>
                  <strong>${escapeText(place.label)}</strong>
                  <p>${escapeText(place.description)}</p>
                  <small>${escapeText(
                    (place.services ?? [])
                      .slice(0, 3)
                      .map(
                        (service) =>
                          placeServiceLabels[service] ?? '服务',
                      )
                      .join(' · '),
                  )}</small>
                </div>
              </article>
            `,
          )
          .join('')}
      </div>
    </section>
  `;
}

export function renderCityResponsibilityPanel(life) {
  const due = life.responsibility.amountDue;
  const obligations = life.responsibility.obligations ?? [];
  return `
    <section class="city-responsibility-panel"
      data-testid="city-responsibility-panel">
      <header>
        <div>
          <small>空间与责任</small>
          <strong>${due > 0 ? '待结费用' : '本期已清'}</strong>
        </div>
        <b>${currency(due)}</b>
      </header>
      <div class="city-capacity-grid">
        <span>场所
          <b>${compactNumber(life.locations.primary.used)} /
            ${compactNumber(life.locations.primary.capacity)}</b>
        </span>
        <span>库位
          <b>${compactNumber(life.locations.storage.used)} /
            ${compactNumber(life.locations.storage.capacity)}</b>
        </span>
        <span>车位
          <b>${compactNumber(life.locations.parking.used)} /
            ${compactNumber(life.locations.parking.capacity)}</b>
        </span>
        <span>下次到期
          <b>第 ${compactNumber(
            life.responsibility.nextDueTick,
          )} 日</b>
        </span>
      </div>
      ${
        obligations.length > 0
          ? `
            <div class="city-obligation-list">
              ${obligations
                .map(
                  (obligation) => `
                    <span>
                      ${escapeText(
                        obligation.type === 'operating_responsibility'
                          ? '经营责任'
                          : obligation.type ===
                              'institutional_operations'
                            ? '机构运营'
                            : '生活责任',
                      )}
                      <b>${currency(obligation.amount)}</b>
                    </span>
                  `,
                )
                .join('')}
            </div>
          `
          : ''
      }
      <button type="button" data-action="life-action"
        data-life-command="settle_obligations"
        ${due <= 0 ? 'disabled' : ''}>
        ${due > 0 ? '结清责任费用' : '暂无待结'}
      </button>
    </section>
  `;
}

export function renderCityServicePanel(life, catalog) {
  const services = catalog
    .filter(
      (item) =>
        item.assetType === 'service' ||
        item.assetType === 'subscription',
    )
    .map((item) => ({
      item,
      access:
        life.serviceContracts[item.id] ??
        life.subscriptions[item.id] ??
        null,
    }))
    .filter(({ access }) => access);
  if (services.length === 0) {
    return `
      <section class="city-service-panel" data-testid="city-service-panel">
        <header><small>有效服务</small><strong>暂无合约</strong></header>
        <p>已预约和已开通的服务会在这里显示剩余期限与次数。</p>
      </section>
    `;
  }
  return `
    <section class="city-service-panel" data-testid="city-service-panel">
      <header>
        <div><small>有效服务</small><strong>合约与预约</strong></div>
        <span>${compactNumber(services.length)} 项</span>
      </header>
      <div class="city-service-grid">
        ${services
          .map(
            ({ item, access }) => `
              <article>
                <div>
                  <strong>${escapeText(item.label)}</strong>
                  <small>至第 ${compactNumber(
                    access.expiresAtTick,
                  )} 日${
                    Number.isSafeInteger(access.usesRemaining)
                      ? ` · 剩 ${compactNumber(access.usesRemaining)} 次`
                      : ''
                  }</small>
                </div>
                <div>
                  ${
                    item.assetType === 'service'
                      ? `
                        <button type="button" data-action="life-action"
                          data-life-command="use_service"
                          data-life-item="${escapeText(item.id)}">
                          ${escapeText(
                            item.interaction?.actionLabel ?? '使用服务',
                          )}
                        </button>
                      `
                      : ''
                  }
                  <button type="button" data-action="life-action"
                    data-life-command="cancel_service"
                    data-life-item="${escapeText(item.id)}">
                    ${item.assetType === 'service' ? '取消预约' : '停止服务'}
                  </button>
                </div>
              </article>
            `,
          )
          .join('')}
      </div>
    </section>
  `;
}

export function renderCityAssetActions({
  possession,
  item,
  placed,
  active,
  canActivate,
  canUse,
}) {
  const activateLabel = {
    housing: '切换为主要场所',
    vehicle: '设为常用出行',
    phone: '设为常用手机',
    computer: '设为常用电脑',
    clothing: '设为常用衣装',
  }[item.category] ?? '设为常用';
  const repairLabel =
    item.category === 'vehicle'
      ? '检修'
      : item.category === 'housing'
        ? '维护'
        : item.category === 'clothing'
          ? '养护'
          : '维修';
  const sellLabel =
    item.category === 'housing'
      ? '出售场所'
      : item.category === 'vehicle'
        ? '出售车辆'
        : '出售';
  return `
    <div class="life-owned-actions">
      ${
        item.assetType === 'durable' &&
        item.space > 0 &&
        item.category !== 'clothing'
          ? `
            <button type="button" data-action="life-action"
              data-life-command="place_asset"
              data-life-instance="${escapeText(possession.instanceId)}">
              ${placed ? '收进库位' : '摆入场所'}
            </button>
          `
          : ''
      }
      ${
        canActivate && !active
          ? `
            <button type="button" data-action="life-action"
              data-life-command="activate_asset"
              data-life-instance="${escapeText(possession.instanceId)}">
              ${activateLabel}
            </button>
          `
          : ''
      }
      ${
        canUse
          ? `
            <button type="button" data-action="life-action"
              data-life-command="use_item"
              data-life-item="${escapeText(item.id)}"
              data-life-instance="${escapeText(possession.instanceId)}">
              ${escapeText(item.interaction?.actionLabel ?? '使用')}
            </button>
          `
          : ''
      }
      <button type="button" data-action="life-action"
        data-life-command="repair_asset"
        data-life-instance="${escapeText(possession.instanceId)}"
        ${possession.condition >= 100 ? 'disabled' : ''}>
        ${repairLabel}
      </button>
      <button type="button" data-action="life-action"
        data-life-command="sell_asset"
        data-life-instance="${escapeText(possession.instanceId)}"
        ${active && item.category === 'housing' ? 'disabled' : ''}>
        ${sellLabel}
      </button>
    </div>
  `;
}
