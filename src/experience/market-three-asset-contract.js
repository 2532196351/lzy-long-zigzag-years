const ASSET_CLASSES = Object.freeze([
  'stock',
  'future',
  'option',
]);
const OPEN_PERMISSION_MODES = new Set([
  'open',
  'testing_open',
  'qualified_open',
  'OPEN',
  'TESTING_OPEN',
]);

export const MARKET_THREE_ASSET_CONTRACT_VERSION =
  'lzy-market-three-asset-contract-v1';

function isRecord(value) {
  return value !== null && typeof value === 'object' &&
    !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function safeInteger(value, minimum = Number.MIN_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function clone(value) {
  return structuredClone(value);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function deriveThreeAssetColumnGeometry({
  viewportWidthPx,
  gapPx = 12,
} = {}) {
  if (
    !safeInteger(viewportWidthPx, 1) ||
    !safeInteger(gapPx, 0)
  ) {
    throw new RangeError('INVALID_THREE_ASSET_GEOMETRY_INPUT');
  }
  const base = {
    schemaVersion: 'lzy_market_three_asset_geometry_v1',
    viewportWidthPx,
    gapPx,
    columnOrder: ['left', 'center', 'right'],
    overflowX: false,
  };
  if (viewportWidthPx < 900) {
    return {
      ...base,
      mode: 'stacked_columns',
      columnWidthsPx: {
        left: viewportWidthPx,
        center: viewportWidthPx,
        right: viewportWidthPx,
      },
      occupiedWidthPx: viewportWidthPx,
    };
  }
  const left = viewportWidthPx >= 1_280 ? 280 : 220;
  const right = viewportWidthPx >= 1_280 ? 340 : 280;
  const center = viewportWidthPx - left - right - gapPx * 2;
  if (center < 320) {
    return {
      ...base,
      mode: 'stacked_columns',
      columnWidthsPx: {
        left: viewportWidthPx,
        center: viewportWidthPx,
        right: viewportWidthPx,
      },
      occupiedWidthPx: viewportWidthPx,
    };
  }
  return {
    ...base,
    mode: 'three_columns',
    columnWidthsPx: { left, center, right },
    occupiedWidthPx:
      left + center + right + gapPx * 2,
  };
}

function emptyTradeSeries() {
  return {
    priceAuthority: 'matched_order_fills_only',
    lastTrade: null,
    tradePoints: [],
    minuteBars: [],
    dailyBars: [],
    archive: null,
  };
}

function stockTradeSeries(quote) {
  const tradePoints = Array.isArray(quote.ultraTrades)
    ? clone(quote.ultraTrades)
    : [];
  const latest = tradePoints.at(-1) ?? null;
  return {
    schemaVersion: 'lzy_cash_equity_trade_series_projection_v1',
    priceAuthority: 'matched_order_fills_only',
    lastTrade: latest
      ? {
          priceTicks: latest.priceTicks,
          source: 'matched_order_fill',
          tradeId:
            latest.tradeId ?? latest.id ?? null,
          atMs:
            latest.atMs ?? latest.timeMs ??
            latest.timestampMs ?? null,
        }
      : null,
    tradePoints,
    minuteBars: Array.isArray(quote.minuteBars)
      ? clone(quote.minuteBars)
      : [],
    dailyBars: Array.isArray(quote.dailyBars)
      ? clone(quote.dailyBars)
      : [],
    archive: null,
  };
}

function stockSeries(quote) {
  return {
    trade: stockTradeSeries(quote),
    mark: {
      applicability: 'not_applicable_for_cash_equity',
      point: null,
    },
    theoretical: {
      applicability: 'diagnostic_not_price_authority',
      point: safeInteger(
        quote.valuation?.midpointTicks,
        1,
      )
        ? {
            priceTicks: quote.valuation.midpointTicks,
            source: 'fundamental_valuation_model',
            sourceFactIds: Array.isArray(
              quote.valuation.sourceFactIds,
            )
              ? clone(quote.valuation.sourceFactIds)
              : [],
          }
        : null,
    },
    settlement: {
      applicability: 'previous_close_reference_only',
      point: safeInteger(quote.previousCloseTicks, 1)
        ? {
            priceTicks: quote.previousCloseTicks,
            source: 'previous_close_reference',
          }
        : null,
    },
  };
}

function derivativeTradeSeries(projection, contractId) {
  const source = projection.seriesByContract?.[contractId];
  const authority =
    projection.priceAuthoritiesByContract?.[contractId];
  if (!source) return emptyTradeSeries();
  const tradePoints = Array.isArray(source.tradePoints)
    ? clone(source.tradePoints)
    : [];
  const authoritativeLastTrade = authority?.lastTrade ?? null;
  const lastPoint = tradePoints.at(-1) ?? null;
  const lastTradeMatches = Boolean(
    authoritativeLastTrade &&
      lastPoint &&
      authoritativeLastTrade.tradeId === lastPoint.tradeId,
  );
  return {
    schemaVersion:
      source.schema ?? 'lzy_derivative_trade_series_v1',
    priceAuthority: 'matched_order_fills_only',
    lastTrade: lastTradeMatches
      ? clone(authoritativeLastTrade)
      : null,
    tradePoints,
    minuteBars: Array.isArray(source.minuteBars)
      ? clone(source.minuteBars)
      : [],
    dailyBars: Array.isArray(source.dailyBars)
      ? clone(source.dailyBars)
      : [],
    archive: source.archive ? clone(source.archive) : null,
  };
}

function derivativeSeries(projection, contractId) {
  const authority =
    projection.priceAuthoritiesByContract?.[contractId] ?? {};
  return {
    trade: derivativeTradeSeries(projection, contractId),
    mark: {
      applicability: 'position_and_risk_mark',
      point: authority.mark ? clone(authority.mark) : null,
    },
    theoretical: {
      applicability: 'diagnostic_not_trade',
      point: authority.theoretical
        ? clone(authority.theoretical)
        : null,
    },
    settlement: {
      applicability: 'clearing_or_contract_settlement',
      point: authority.settlement
        ? clone(authority.settlement)
        : null,
    },
  };
}

function instrumentList(stockProjection, derivativesProjection) {
  const stocks = Object.entries(
    stockProjection?.symbols ?? {},
  ).map(([assetId, quote]) => ({
    assetClass: 'stock',
    assetId,
    displayName: quote.displayName ?? assetId,
  }));
  const futures = Object.entries(
    derivativesProjection?.contracts?.futures ?? {},
  ).map(([assetId, contract]) => ({
    assetClass: 'future',
    assetId,
    displayName: contract.displayName ?? assetId,
  }));
  const options = Object.entries(
    derivativesProjection?.contracts?.options ?? {},
  ).map(([assetId, contract]) => ({
    assetClass: 'option',
    assetId,
    displayName: contract.displayName ?? assetId,
  }));
  return [...stocks, ...futures, ...options].sort(
    (left, right) =>
      ASSET_CLASSES.indexOf(left.assetClass) -
        ASSET_CLASSES.indexOf(right.assetClass) ||
      compareText(left.assetId, right.assetId),
  );
}

function resolveSelection(
  selection,
  stockProjection,
  derivativesProjection,
) {
  if (
    !isRecord(selection) ||
    !ASSET_CLASSES.includes(selection.assetClass) ||
    !nonEmptyString(selection.assetId)
  ) {
    return null;
  }
  if (selection.assetClass === 'stock') {
    const quote = stockProjection?.symbols?.[selection.assetId];
    if (!quote) return null;
    return {
      instrument: {
        assetClass: 'stock',
        assetId: selection.assetId,
        displayName:
          quote.displayName ?? selection.assetId,
        authorityCommitSeq:
          quote.authorityCommitSeq ??
          stockProjection.commitSeq ?? null,
      },
      book: {
        bids: Array.isArray(quote.bids)
          ? clone(quote.bids)
          : [],
        asks: Array.isArray(quote.asks)
          ? clone(quote.asks)
          : [],
      },
      series: stockSeries(quote),
      observedCommitSeq:
        quote.authorityCommitSeq ??
        stockProjection.commitSeq ?? null,
      nowMs: stockProjection.nowMs ?? null,
    };
  }
  const collection =
    selection.assetClass === 'future'
      ? derivativesProjection?.contracts?.futures
      : derivativesProjection?.contracts?.options;
  const contract = collection?.[selection.assetId];
  if (!contract) return null;
  return {
    instrument: {
      assetClass: selection.assetClass,
      assetId: selection.assetId,
      displayName:
        contract.displayName ?? selection.assetId,
      contract: clone(contract),
    },
    book: {
      bids: Array.isArray(
        derivativesProjection.books?.[selection.assetId]?.bids,
      )
        ? clone(
            derivativesProjection.books[selection.assetId].bids,
          )
        : [],
      asks: Array.isArray(
        derivativesProjection.books?.[selection.assetId]?.asks,
      )
        ? clone(
            derivativesProjection.books[selection.assetId].asks,
          )
        : [],
    },
    series: derivativeSeries(
      derivativesProjection,
      selection.assetId,
    ),
    observedCommitSeq:
      derivativesProjection.commitSeq ?? null,
    nowMs: derivativesProjection.nowMs ?? null,
  };
}

export function projectThreeAssetMarketColumns({
  selection,
  stockProjection,
  derivativesProjection,
  permissionModeByAssetClass = {},
} = {}) {
  const resolved = resolveSelection(
    selection,
    stockProjection,
    derivativesProjection,
  );
  const base = {
    schemaVersion: 'lzy_market_three_asset_columns_v1',
    ruleVersion: MARKET_THREE_ASSET_CONTRACT_VERSION,
    authority: 'read_only_projection',
    integrationStatus: 'not_integrated',
    status: resolved ? 'ready' : 'blocked',
    assetTabs: [...ASSET_CLASSES],
    observedCommitSeq: resolved?.observedCommitSeq ?? null,
    nowMs: resolved?.nowMs ?? null,
    columns: null,
    reasonCodes: resolved ? [] : ['ASSET_SELECTION_INVALID'],
  };
  if (!resolved) return base;
  const selectedEntityKey =
    `${selection.assetClass}:${selection.assetId}`;
  const permissionMode =
    permissionModeByAssetClass?.[selection.assetClass] ??
    'locked';
  return {
    ...base,
    columns: {
      left: {
        selectedEntityKey,
        instrumentList: instrumentList(
          stockProjection,
          derivativesProjection,
        ),
      },
      center: {
        selectedEntityKey,
        instrument: resolved.instrument,
        series: resolved.series,
      },
      right: {
        selectedEntityKey,
        book: resolved.book,
        orderAction: {
          permissionMode,
          canSubmitOrder:
            OPEN_PERMISSION_MODES.has(permissionMode),
          changesMarketFacts: false,
        },
      },
    },
  };
}
