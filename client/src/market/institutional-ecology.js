/**
 * LZY institutional and retail ecology contract.
 *
 * This module is intentionally not a second market.  It owns bounded strategy,
 * research, authorization, learning, and parent-order state.  It never matches
 * orders, changes a traded price, settles cash or securities, or creates a
 * world fact.  The only production-facing output is a standard order intent;
 * the existing realtime simulator remains the sole execution and ledger
 * authority.
 */

import {
  evaluateProfitSeekingOrder,
} from './behavior-kernel.js?v=20260801-01';

export const INSTITUTIONAL_ECOLOGY_RULE_VERSION =
  'lzy-institutional-ecology-contract-0.3.2';
export const INSTITUTIONAL_VALUATION_INPUT_VERSION =
  'lzy-enterprise-valuation-observation-0.2.1';
export const ECOLOGY_FRAME_MS = 3_000;
export const ECOLOGY_WORLD_DAY_MS = 86_400_000;
export const ECOLOGY_SPEED_MULTIPLIERS = Object.freeze({
  1: 3,
  4: 12,
  16: 48,
});

const PPM = 1_000_000;
const BPS = 10_000;
const MAX_HISTORY = 256;
const MAX_INTENT_CAPABILITY_HISTORY = MAX_HISTORY * 4;
const INTENT_CAPABILITY_STATUSES = new Set([
  'ISSUED',
  'CONSUMED',
  'EXPIRED_UNSUBMITTED',
]);
const FACT_WEIGHT_PPM = 800_000;
const NARRATIVE_WEIGHT_PPM = 200_000;
const DEFAULT_CAPITAL_SCALE_PPM = 1_000_000;
const DEFAULT_VALUATION_MULTIPLES_MILLI = Object.freeze({
  earnings: 10_000,
  book: 1_000,
  freeCashFlow: 12_000,
  distribution: 16_000,
});
const VALUATION_OBSERVATION_FIELDS = new Set([
  'contractVersion',
  'symbol',
  'asOfMs',
  'publishedMs',
  'expectedHorizonMs',
  'riskFreeRateBps',
  'issuerCreditSpreadBps',
  'longTermGrowthPpm',
  'ttmRevenueCents',
  'ttmNetProfitCents',
  'ttmFreeCashFlowCents',
  'expectedRevenueCents',
  'expectedNetProfitCents',
  'expectedFreeCashFlowCents',
  'bookEquityCents',
  'netDebtCents',
  'floatShares',
  'totalShares',
  'dilutedShares',
  'shareCountPeriodStartMs',
  'periodStartTotalShares',
  'dividendsPaidCents',
  'buybackShares',
  'newSharesIssued',
  'buybackCashPaidCents',
  'issuanceProceedsCents',
  'capitalActionsReflectedInFinancials',
  'confidenceIntervalPpm',
  'derivation',
  'evidenceSources',
]);
const VALUATION_EVIDENCE_SOURCE_FIELDS = new Set([
  'id',
  'kind',
  'authority',
  'visibility',
  'publishedMs',
  'factIds',
]);
const VALUATION_DERIVATION_FIELDS = new Set([
  'kind',
  'inputFactIds',
  'fieldFactIds',
  'excludesMarketPriceInputs',
]);
const VALUATION_LINEAGED_FIELDS = Object.freeze([
  'expectedHorizonMs',
  'riskFreeRateBps',
  'issuerCreditSpreadBps',
  'longTermGrowthPpm',
  'ttmRevenueCents',
  'ttmNetProfitCents',
  'ttmFreeCashFlowCents',
  'expectedRevenueCents',
  'expectedNetProfitCents',
  'expectedFreeCashFlowCents',
  'bookEquityCents',
  'netDebtCents',
  'floatShares',
  'totalShares',
  'dilutedShares',
  'shareCountPeriodStartMs',
  'periodStartTotalShares',
  'dividendsPaidCents',
  'buybackShares',
  'newSharesIssued',
  'buybackCashPaidCents',
  'issuanceProceedsCents',
  'capitalActionsReflectedInFinancials',
  'confidenceIntervalPpm',
]);
const BOUND_ACCOUNT_OBSERVATION_FIELDS = new Set([
  'accountId',
  'brokerId',
  'commitSeq',
  'cashCents',
  'holdings',
  'drawdownBps',
  'fundingStressBps',
  'redemptionPressurePpm',
]);
const RESEARCH_EVIDENCE_FIELDS = new Set([
  'actorId',
  'id',
  'symbol',
  'kind',
  'layer',
  'direction',
  'strengthPpm',
  'publishedMs',
  'visibility',
  'sourceAuthority',
  'sourceIds',
]);
const VALUATION_EVIDENCE_RELIABILITY_PPM = Object.freeze({
  authoritative_game_company_fact: 1_000_000,
  world_fact_ledger: 1_000_000,
  audited_issuer_filing: 970_000,
  exchange_disclosure: 930_000,
  issuer_accounting_ledger: 880_000,
  board_approved_guidance: 740_000,
});
const VALUATION_EVIDENCE_AUTHORITIES_BY_KIND = Object.freeze({
  game_enterprise_filing: Object.freeze([
    'authoritative_game_company_fact',
  ]),
  world_company_fact: Object.freeze([
    'world_fact_ledger',
    'authoritative_game_company_fact',
  ]),
  audited_financial_statement: Object.freeze([
    'audited_issuer_filing',
  ]),
  exchange_corporate_action: Object.freeze([
    'exchange_disclosure',
  ]),
  issuer_operating_ledger: Object.freeze([
    'issuer_accounting_ledger',
  ]),
  management_guidance: Object.freeze([
    'board_approved_guidance',
  ]),
});
const RESEARCH_FACT_AUTHORITIES_BY_KIND = Object.freeze({
  exchange_filing: Object.freeze(['exchange_disclosure']),
  audited_financial: Object.freeze(['audited_issuer_filing']),
  world_company_fact: Object.freeze([
    'world_fact_ledger',
    'authoritative_game_company_fact',
  ]),
  issuer_operating_ledger: Object.freeze([
    'issuer_accounting_ledger',
  ]),
});
const ALLOWED_VALUATION_DERIVATION_KINDS = new Set([
  'game_enterprise_operating_and_accounting_facts',
  'game_enterprise_forward_estimate',
  'direct_world_company_facts',
]);
const ALLOWED_REGIMES = new Set([
  'trend_up',
  'trend_down',
  'mean_reverting',
  'high_vol_event',
  'index_rebalance',
]);

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stableStringify(value) {
  return JSON.stringify(value, (_key, nested) => {
    if (
      !nested ||
      typeof nested !== 'object' ||
      Array.isArray(nested)
    ) {
      return nested;
    }
    return Object.fromEntries(
      Object.keys(nested)
        .sort((left, right) => left.localeCompare(right))
        .map((key) => [key, nested[key]]),
    );
  });
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function sign(value) {
  return value > 0 ? 1 : value < 0 ? -1 : 0;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function safeRatioPpm(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) ||
      denominator === 0) {
    return 0;
  }
  return Math.round(numerator * PPM / denominator);
}

function integerScale(value, scalePpm) {
  return Math.max(1, Math.round(value * scalePpm / PPM));
}

function hashSeed(seed) {
  const text = String(seed);
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0 || 1;
}

function nextRandomUint(state) {
  let value = state.rngState >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.rngState = value >>> 0 || 1;
  return state.rngState;
}

function nextRandomPpm(state) {
  return nextRandomUint(state) % PPM;
}

function sortedSymbols(symbols) {
  return [...symbols].sort((left, right) => left.localeCompare(right));
}

function blankHoldings(symbols, units) {
  return Object.fromEntries(
    symbols.map((symbol, index) => [
      symbol,
      Math.max(0, Math.floor(units * (1 + index * 0.12))),
    ]),
  );
}

function makePortfolio(symbols, cashCents, holdingUnits, authority) {
  const holdings = blankHoldings(symbols, holdingUnits);
  return {
    authority,
    cashCents,
    holdings,
    costBasisTicks: Object.fromEntries(symbols.map((symbol) => [symbol, 0])),
    initialCashCents: cashCents,
    initialHoldings: cloneJson(holdings),
    observedCommitSeq: 0,
    observedAccountDigest: null,
    observedFrameMs: null,
  };
}

function makeMandate({
  capitalScalePpm,
  maxGrossCents,
  maxOrderUnits,
  maxPositionUnits,
  maxParticipationPpm,
  liquidityReservePpm,
  permittedSides = ['buy', 'sell'],
  benchmark = 'cash_plus_public_equity',
}) {
  return {
    benchmark,
    permittedSides,
    maxGrossCents: integerScale(maxGrossCents, capitalScalePpm),
    maxOrderUnits: integerScale(maxOrderUnits, capitalScalePpm),
    maxPositionUnits: integerScale(maxPositionUnits, capitalScalePpm),
    maxParticipationPpm,
    liquidityReservePpm,
    leverageAllowed: false,
    shortingAllowed: false,
    derivativesAllowed: false,
    version: 'mandate-0.1.0',
  };
}

function makeAuthorization(capitalScalePpm, cents, level) {
  const scaled = integerScale(cents, capitalScalePpm);
  return {
    level,
    approvedCents: scaled,
    remainingCents: scaled,
    expiresMs: ECOLOGY_WORLD_DAY_MS,
    exceptions: [],
  };
}

function makeLearning({
  aggressivenessPpm = 500_000,
  explorationPpm = 100_000,
  learningRatePpm = 120_000,
} = {}) {
  return {
    aggressivenessPpm,
    explorationPpm,
    learningRatePpm,
    opponentModels: {},
    recentNetAlphaCents: 0,
    observations: 0,
  };
}

function makePerformance() {
  return {
    tradedNotionalCents: 0,
    executionCostsCents: 0,
    capacitySamples: [],
    activeAlphaSamplesCents: [],
    lastSettlementCommitSeq: 0,
  };
}

function valuationPolicyFor(participant) {
  const policies = {
    quant_trend: {
      mode: 'risk_anchor_not_primary_signal',
      methodWeightsPpm: {
        earnings: 420_000,
        book: 100_000,
        freeCashFlow: 360_000,
        distribution: 120_000,
      },
      horizonMs: 15_552_000_000,
      observationDelayMs: 3_000,
      forwardWeightPpm: 560_000,
      noiseBandPpm: 45_000,
      debtPenaltyPpm: 520_000,
      crowdingMarginPpm: 120_000,
    },
    quant_value: {
      mode: 'primary_intrinsic_value_signal',
      methodWeightsPpm: {
        earnings: 300_000,
        book: 280_000,
        freeCashFlow: 330_000,
        distribution: 90_000,
      },
      horizonMs: 31_536_000_000,
      observationDelayMs: 6_000,
      forwardWeightPpm: 620_000,
      noiseBandPpm: 22_000,
      debtPenaltyPpm: 680_000,
      crowdingMarginPpm: 180_000,
    },
    quant_stat_arb: {
      mode: 'structural_break_and_relative_value_filter',
      methodWeightsPpm: {
        earnings: 280_000,
        book: 340_000,
        freeCashFlow: 300_000,
        distribution: 80_000,
      },
      horizonMs: 7_776_000_000,
      observationDelayMs: 3_000,
      forwardWeightPpm: 400_000,
      noiseBandPpm: 30_000,
      debtPenaltyPpm: 620_000,
      crowdingMarginPpm: 220_000,
    },
    quant_volatility_risk_parity: {
      mode: 'risk_budget_quality_filter',
      methodWeightsPpm: {
        earnings: 180_000,
        book: 300_000,
        freeCashFlow: 420_000,
        distribution: 100_000,
      },
      horizonMs: 31_536_000_000,
      observationDelayMs: 9_000,
      forwardWeightPpm: 480_000,
      noiseBandPpm: 18_000,
      debtPenaltyPpm: 820_000,
      crowdingMarginPpm: 140_000,
    },
    passive_index: {
      mode: 'benchmark_only_no_investment_valuation',
      methodWeightsPpm: null,
      horizonMs: 0,
      observationDelayMs: 0,
      forwardWeightPpm: 0,
      noiseBandPpm: 0,
      debtPenaltyPpm: 0,
      crowdingMarginPpm: 0,
    },
    event_driven: {
      mode: 'event_terms_with_enterprise_failure_value',
      methodWeightsPpm: {
        earnings: 220_000,
        book: 250_000,
        freeCashFlow: 430_000,
        distribution: 100_000,
      },
      horizonMs: 7_776_000_000,
      observationDelayMs: 6_000,
      forwardWeightPpm: 520_000,
      noiseBandPpm: 55_000,
      debtPenaltyPpm: 760_000,
      crowdingMarginPpm: 260_000,
    },
    discretionary_industry: {
      mode: 'research_committee_intrinsic_value_distribution',
      methodWeightsPpm: {
        earnings: 260_000,
        book: 160_000,
        freeCashFlow: 470_000,
        distribution: 110_000,
      },
      horizonMs: 63_072_000_000,
      observationDelayMs: 18_000,
      forwardWeightPpm: 720_000,
      noiseBandPpm: 35_000,
      debtPenaltyPpm: 720_000,
      crowdingMarginPpm: 200_000,
    },
    broker_execution: {
      mode: 'agency_execution_no_investment_valuation',
      methodWeightsPpm: null,
      horizonMs: 0,
      observationDelayMs: 0,
      forwardWeightPpm: 0,
      noiseBandPpm: 0,
      debtPenaltyPpm: 0,
      crowdingMarginPpm: 0,
    },
    strategic_capital: {
      mode: 'long_horizon_control_and_cash_flow_value',
      methodWeightsPpm: {
        earnings: 220_000,
        book: 210_000,
        freeCashFlow: 450_000,
        distribution: 120_000,
      },
      horizonMs: 94_608_000_000,
      observationDelayMs: 12_000,
      forwardWeightPpm: 780_000,
      noiseBandPpm: 48_000,
      debtPenaltyPpm: 660_000,
      crowdingMarginPpm: 160_000,
    },
    attention_momentum_new_buyers: {
      mode: 'noisy_short_horizon_public_value',
      methodWeightsPpm: {
        earnings: 470_000,
        book: 120_000,
        freeCashFlow: 260_000,
        distribution: 150_000,
      },
      horizonMs: 2_592_000_000,
      observationDelayMs: 3_000,
      forwardWeightPpm: 350_000,
      noiseBandPpm: 180_000,
      debtPenaltyPpm: 320_000,
      crowdingMarginPpm: 320_000,
    },
    disposition_limit_sellers: {
      mode: 'reference_point_with_public_value',
      methodWeightsPpm: {
        earnings: 260_000,
        book: 330_000,
        freeCashFlow: 280_000,
        distribution: 130_000,
      },
      horizonMs: 15_552_000_000,
      observationDelayMs: 12_000,
      forwardWeightPpm: 380_000,
      noiseBandPpm: 110_000,
      debtPenaltyPpm: 520_000,
      crowdingMarginPpm: 180_000,
    },
    household_liquidity_need: {
      mode: 'liquidity_obligation_primary_value_secondary',
      methodWeightsPpm: {
        earnings: 220_000,
        book: 300_000,
        freeCashFlow: 330_000,
        distribution: 150_000,
      },
      horizonMs: 7_776_000_000,
      observationDelayMs: 15_000,
      forwardWeightPpm: 320_000,
      noiseBandPpm: 140_000,
      debtPenaltyPpm: 650_000,
      crowdingMarginPpm: 120_000,
    },
    adaptive_mixed_retail: {
      mode: 'adaptive_public_value_and_price_mix',
      methodWeightsPpm: {
        earnings: 310_000,
        book: 220_000,
        freeCashFlow: 350_000,
        distribution: 120_000,
      },
      horizonMs: 15_552_000_000,
      observationDelayMs: 9_000,
      forwardWeightPpm: 480_000,
      noiseBandPpm: 90_000,
      debtPenaltyPpm: 560_000,
      crowdingMarginPpm: 220_000,
    },
  };
  const policy = policies[participant.archetype];
  if (!policy) {
    throw new Error(`missing valuation policy: ${participant.archetype}`);
  }
  const uncertaintyAversionPpm = {
    quant_trend: 280_000,
    quant_value: 620_000,
    quant_stat_arb: 520_000,
    quant_volatility_risk_parity: 820_000,
    passive_index: 0,
    event_driven: 700_000,
    discretionary_industry: 740_000,
    broker_execution: 0,
    strategic_capital: 580_000,
    attention_momentum_new_buyers: 160_000,
    disposition_limit_sellers: 480_000,
    household_liquidity_need: 650_000,
    adaptive_mixed_retail: 420_000,
  }[participant.archetype];
  const evidenceSkepticismPpm = {
    quant_trend: 260_000,
    quant_value: 540_000,
    quant_stat_arb: 470_000,
    quant_volatility_risk_parity: 760_000,
    passive_index: 0,
    event_driven: 680_000,
    discretionary_industry: 820_000,
    broker_execution: 0,
    strategic_capital: 650_000,
    attention_momentum_new_buyers: 120_000,
    disposition_limit_sellers: 360_000,
    household_liquidity_need: 520_000,
    adaptive_mixed_retail: 390_000,
  }[participant.archetype];
  const equityRiskPremiumBps = {
    quant_trend: 620,
    quant_value: 560,
    quant_stat_arb: 690,
    quant_volatility_risk_parity: 520,
    passive_index: 0,
    event_driven: 760,
    discretionary_industry: 540,
    broker_execution: 0,
    strategic_capital: 480,
    attention_momentum_new_buyers: 900,
    disposition_limit_sellers: 720,
    household_liquidity_need: 820,
    adaptive_mixed_retail: 680,
  }[participant.archetype];
  const growthPassThroughPpm = {
    quant_trend: 480_000,
    quant_value: 650_000,
    quant_stat_arb: 360_000,
    quant_volatility_risk_parity: 420_000,
    passive_index: 0,
    event_driven: 300_000,
    discretionary_industry: 780_000,
    broker_execution: 0,
    strategic_capital: 850_000,
    attention_momentum_new_buyers: 250_000,
    disposition_limit_sellers: 380_000,
    household_liquidity_need: 280_000,
    adaptive_mixed_retail: 520_000,
  }[participant.archetype];
  const rateSensitivityPpm = {
    quant_trend: 450_000,
    quant_value: 720_000,
    quant_stat_arb: 420_000,
    quant_volatility_risk_parity: 820_000,
    passive_index: 0,
    event_driven: 680_000,
    discretionary_industry: 760_000,
    broker_execution: 0,
    strategic_capital: 880_000,
    attention_momentum_new_buyers: 250_000,
    disposition_limit_sellers: 470_000,
    household_liquidity_need: 620_000,
    adaptive_mixed_retail: 540_000,
  }[participant.archetype];
  return {
    ...cloneJson(policy),
    uncertaintyAversionPpm,
    evidenceSkepticismPpm,
    equityRiskPremiumBps,
    referenceCapitalizationRateBps: 800,
    growthPassThroughPpm,
    rateSensitivityPpm,
    multiplesMilli: cloneJson(DEFAULT_VALUATION_MULTIPLES_MILLI),
  };
}

function attachValuationPolicies(participants) {
  for (const participant of Object.values(participants)) {
    participant.valuationPolicy = valuationPolicyFor(participant);
    participant.valuationViews = {};
    participant.lastValuationObservationPublishedMs = {};
  }
}

function bindingFor(actorBindings, actorId) {
  const binding = actorBindings?.[actorId];
  if (!binding) {
    return {
      status: 'UNBOUND_NO_MARKET_AUTHORITY',
      accountId: null,
      brokerId: null,
    };
  }
  if (
    typeof binding.accountId !== 'string' ||
    binding.accountId.length === 0 ||
    typeof binding.brokerId !== 'string' ||
    binding.brokerId.length === 0
  ) {
    throw new TypeError(`invalid actor binding for ${actorId}`);
  }
  return {
    status: 'BOUND_TO_REALTIME_ACCOUNT',
    accountId: binding.accountId,
    brokerId: binding.brokerId,
  };
}

function institutionTemplate({
  id,
  archetype,
  decisionPipeline,
  symbols,
  actorBindings,
  capitalScalePpm,
  cashCents,
  holdingUnits,
  maxGrossCents,
  maxOrderUnits,
  maxPositionUnits,
  maxParticipationPpm,
  liquidityReservePpm,
  authorizationCents,
  authorizationLevel,
  model,
  liability,
}) {
  return {
    id,
    kind: 'institution',
    archetype,
    decisionPipeline,
    binding: bindingFor(actorBindings, id),
    portfolio: makePortfolio(
      symbols,
      integerScale(cashCents, capitalScalePpm),
      integerScale(holdingUnits, capitalScalePpm),
      'observation_cache_not_settlement_authority',
    ),
    mandate: makeMandate({
      capitalScalePpm,
      maxGrossCents,
      maxOrderUnits,
      maxPositionUnits,
      maxParticipationPpm,
      liquidityReservePpm,
    }),
    authorization: makeAuthorization(
      capitalScalePpm,
      authorizationCents,
      authorizationLevel,
    ),
    liability: {
      redemptionNoticeMs: liability.redemptionNoticeMs,
      clientLiquidityFloorPpm: liability.clientLiquidityFloorPpm,
      redemptionPressurePpm: 0,
      clientCapitalStabilityPpm: liability.clientCapitalStabilityPpm,
    },
    model,
    learning: makeLearning(model.learning),
    performance: makePerformance(),
    observedRisk: {
      drawdownBps: 0,
      fundingStressBps: 0,
      redemptionPressurePpm: 0,
    },
    crowding: {
      capitalFollowingPpm: 0,
      publicFootprintPpm: 0,
      holdingOverlapPpm: 0,
      synchronizedFlowPpm: 0,
      redemptionCorrelationPpm: 0,
    },
    status: 'active',
  };
}

function createInstitutions({
  symbols,
  actorBindings,
  capitalScalePpm,
}) {
  const commonLiability = {
    redemptionNoticeMs: 21_600_000,
    clientLiquidityFloorPpm: 100_000,
    clientCapitalStabilityPpm: 650_000,
  };
  const templates = [
    institutionTemplate({
      id: 'inst_quant_trend',
      archetype: 'quant_trend',
      decisionPipeline: 'systematic_dual_horizon_trend',
      symbols,
      actorBindings,
      capitalScalePpm,
      cashCents: 420_000_000,
      holdingUnits: 70_000,
      maxGrossCents: 900_000_000,
      maxOrderUnits: 12_000,
      maxPositionUnits: 180_000,
      maxParticipationPpm: 90_000,
      liquidityReservePpm: 80_000,
      authorizationCents: 360_000_000,
      authorizationLevel: 'systematic_product_rulebook',
      model: {
        name: 'dual_horizon_momentum',
        fastLookbackFrames: 4,
        slowLookbackFrames: 12,
        volatilityTargetBps: 260,
        signalThresholdPpm: 2_000,
        learning: {
          aggressivenessPpm: 570_000,
          explorationPpm: 70_000,
        },
      },
      liability: commonLiability,
    }),
    institutionTemplate({
      id: 'inst_quant_value',
      archetype: 'quant_value',
      decisionPipeline: 'delayed_fundamental_target_portfolio',
      symbols,
      actorBindings,
      capitalScalePpm,
      cashCents: 500_000_000,
      holdingUnits: 85_000,
      maxGrossCents: 1_100_000_000,
      maxOrderUnits: 10_000,
      maxPositionUnits: 220_000,
      maxParticipationPpm: 65_000,
      liquidityReservePpm: 120_000,
      authorizationCents: 440_000_000,
      authorizationLevel: 'fundamental_product_rulebook',
      model: {
        name: 'enterprise_per_share_value_distribution',
        valuationContractVersion: INSTITUTIONAL_VALUATION_INPUT_VERSION,
        qualityFloorPpm: 450_000,
        signalThresholdPpm: 8_000,
        learning: {
          aggressivenessPpm: 390_000,
          explorationPpm: 80_000,
        },
      },
      liability: {
        ...commonLiability,
        redemptionNoticeMs: 43_200_000,
        clientCapitalStabilityPpm: 760_000,
      },
    }),
    institutionTemplate({
      id: 'inst_quant_stat_arb',
      archetype: 'quant_stat_arb',
      decisionPipeline: 'relative_value_pair_state_machine',
      symbols,
      actorBindings,
      capitalScalePpm,
      cashCents: 360_000_000,
      holdingUnits: 75_000,
      maxGrossCents: 720_000_000,
      maxOrderUnits: 8_000,
      maxPositionUnits: 140_000,
      maxParticipationPpm: 55_000,
      liquidityReservePpm: 150_000,
      authorizationCents: 300_000_000,
      authorizationLevel: 'relative_value_rulebook',
      model: {
        name: 'pair_spread_zscore',
        pair: symbols.slice(0, 2),
        formationFrames: 10,
        entryZMilli: 900,
        exitZMilli: 250,
        structuralBreakPpm: 220_000,
        borrowingState: 'NO_SHORT_INSTRUMENT_AVAILABLE',
        implementationBoundary: 'relative_value_long_cash_only',
        learning: {
          aggressivenessPpm: 440_000,
          explorationPpm: 130_000,
        },
      },
      liability: commonLiability,
    }),
    institutionTemplate({
      id: 'inst_quant_volatility_risk_parity',
      archetype: 'quant_volatility_risk_parity',
      decisionPipeline: 'lagged_covariance_risk_budget',
      symbols,
      actorBindings,
      capitalScalePpm,
      cashCents: 560_000_000,
      holdingUnits: 65_000,
      maxGrossCents: 1_000_000_000,
      maxOrderUnits: 9_000,
      maxPositionUnits: 190_000,
      maxParticipationPpm: 50_000,
      liquidityReservePpm: 180_000,
      authorizationCents: 420_000_000,
      authorizationLevel: 'risk_budget_rulebook',
      model: {
        name: 'equal_risk_contribution',
        targetPortfolioVolBps: 220,
        covarianceLookbackFrames: 20,
        rebalanceThresholdPpm: 20_000,
        implementationBoundary:
          'public_equity_inverse_volatility_proxy_not_classic_multi_asset_risk_parity',
        learning: {
          aggressivenessPpm: 330_000,
          explorationPpm: 60_000,
        },
      },
      liability: {
        ...commonLiability,
        clientLiquidityFloorPpm: 180_000,
      },
    }),
    institutionTemplate({
      id: 'inst_passive_index',
      archetype: 'passive_index',
      decisionPipeline: 'benchmark_tracking_rebalance',
      symbols,
      actorBindings,
      capitalScalePpm,
      cashCents: 300_000_000,
      holdingUnits: 115_000,
      maxGrossCents: 1_300_000_000,
      maxOrderUnits: 14_000,
      maxPositionUnits: 260_000,
      maxParticipationPpm: 100_000,
      liquidityReservePpm: 60_000,
      authorizationCents: 520_000_000,
      authorizationLevel: 'published_index_methodology',
      model: {
        name: 'tracking_error_rebalance',
        lastWeightsPpm: {},
        pendingWeightsPpm: {},
        trackingErrorBudgetBps: 45,
        rebalanceWindowMs: 36_000,
        primaryMarketBoundary: 'NO_ETF_PCF_OR_AUTHORIZED_PARTICIPANT',
        learning: {
          aggressivenessPpm: 300_000,
          explorationPpm: 0,
        },
      },
      liability: {
        ...commonLiability,
        clientCapitalStabilityPpm: 900_000,
      },
    }),
    institutionTemplate({
      id: 'inst_event_driven',
      archetype: 'event_driven',
      decisionPipeline: 'event_state_probability_tree',
      symbols,
      actorBindings,
      capitalScalePpm,
      cashCents: 380_000_000,
      holdingUnits: 70_000,
      maxGrossCents: 760_000_000,
      maxOrderUnits: 8_500,
      maxPositionUnits: 145_000,
      maxParticipationPpm: 60_000,
      liquidityReservePpm: 170_000,
      authorizationCents: 310_000_000,
      authorizationLevel: 'event_book_authority',
      model: {
        name: 'probability_weighted_event',
        events: {},
        failureHaircutPpm: 180_000,
        probabilityRevisionCadenceMs: 9_000,
        hedgingBoundary: 'cash_deal_long_only_without_borrow',
        learning: {
          aggressivenessPpm: 480_000,
          explorationPpm: 90_000,
        },
      },
      liability: commonLiability,
    }),
    institutionTemplate({
      id: 'inst_discretionary_industry',
      archetype: 'discretionary_industry',
      decisionPipeline: 'finite_attention_research_committee',
      symbols,
      actorBindings,
      capitalScalePpm,
      cashCents: 620_000_000,
      holdingUnits: 90_000,
      maxGrossCents: 1_250_000_000,
      maxOrderUnits: 11_000,
      maxPositionUnits: 230_000,
      maxParticipationPpm: 48_000,
      liquidityReservePpm: 220_000,
      authorizationCents: 400_000_000,
      authorizationLevel: 'investment_committee',
      model: {
        name: 'fact_weighted_committee_case',
        falsificationRequired: true,
        learning: {
          aggressivenessPpm: 290_000,
          explorationPpm: 110_000,
        },
      },
      liability: {
        ...commonLiability,
        redemptionNoticeMs: 86_400_000,
        clientCapitalStabilityPpm: 820_000,
      },
    }),
    institutionTemplate({
      id: 'inst_broker_execution',
      archetype: 'broker_execution',
      decisionPipeline: 'client_parent_order_cost_risk_execution',
      symbols,
      actorBindings,
      capitalScalePpm,
      cashCents: 240_000_000,
      holdingUnits: 35_000,
      maxGrossCents: 480_000_000,
      maxOrderUnits: 20_000,
      maxPositionUnits: 80_000,
      maxParticipationPpm: 120_000,
      liquidityReservePpm: 250_000,
      authorizationCents: 240_000_000,
      authorizationLevel: 'agency_execution_only',
      model: {
        name: 'parent_order_schedule',
        allowedAlgorithms: ['TWAP', 'POV', 'COST_RISK'],
        investmentViewAllowed: false,
        learning: {
          aggressivenessPpm: 500_000,
          explorationPpm: 40_000,
        },
      },
      liability: {
        ...commonLiability,
        clientLiquidityFloorPpm: 300_000,
      },
    }),
    institutionTemplate({
      id: 'inst_strategic_capital',
      archetype: 'strategic_capital',
      decisionPipeline: 'strategic_network_intervention_authority',
      symbols,
      actorBindings,
      capitalScalePpm,
      cashCents: 900_000_000,
      holdingUnits: 120_000,
      maxGrossCents: 1_800_000_000,
      maxOrderUnits: 30_000,
      maxPositionUnits: 400_000,
      maxParticipationPpm: 150_000,
      liquidityReservePpm: 160_000,
      authorizationCents: 650_000_000,
      authorizationLevel: 'board_reserved_strategic_capital',
      model: {
        name: 'network_intervention_options',
        allowedTargets: ['market_flow', 'company_network', 'relationship_network'],
        noAutomaticMoralPenalty: true,
        learning: {
          aggressivenessPpm: 620_000,
          explorationPpm: 120_000,
        },
      },
      liability: {
        ...commonLiability,
        clientCapitalStabilityPpm: 540_000,
      },
    }),
  ];

  const discretionary = templates.find(
    (participant) => participant.id === 'inst_discretionary_industry',
  );
  discretionary.organization = {
    attentionSlots: 3,
    researchCadenceMs: 18_000,
    observationDelayMs: 6_000,
    nextResearchMs: 18_000,
    evidenceLedger: {},
    narratives: {},
    hypotheses: Object.fromEntries(
      symbols.map((symbol) => [
        symbol,
        {
          factScorePpm: 0,
          narrativeScorePpm: 0,
          combinedScorePpm: 0,
          factCount: 0,
          narrativeCount: 0,
          falsifiers: [],
          updatedMs: 0,
        },
      ]),
    ),
    committee: {
      members: [
        { id: 'portfolio_manager', voteWeightPpm: 400_000 },
        { id: 'risk_officer', voteWeightPpm: 350_000 },
        { id: 'research_head', voteWeightPpm: 250_000 },
      ],
      quorumPpm: 650_000,
      lastVotes: [],
      lastDecision: 'defer',
      lastReviewMs: 0,
    },
    positionInertiaPpm: 680_000,
    clientDuty: {
      maxDrawdownBps: 1_800,
      minimumCashPpm: 220_000,
      redemptionResponseRequired: true,
    },
  };

  return Object.fromEntries(
    templates.map((participant) => [participant.id, participant]),
  );
}

function retailTemplate({
  id,
  archetype,
  decisionPipeline,
  symbols,
  actorBindings,
  cashCents,
  holdingUnits,
  activeHouseholds,
  entrantReserve,
  arrivalRatePpm,
  typicalLotUnits,
  priceSensitivityPpm,
  limitPreferencePpm,
  attentionSensitivityPpm,
  dispositionPpm,
  liquidityNeedPpm,
  learning,
}) {
  return {
    id,
    kind: 'retail_cohort',
    archetype,
    decisionPipeline,
    binding: bindingFor(actorBindings, id),
    portfolio: makePortfolio(
      symbols,
      cashCents,
      holdingUnits,
      'finite_cohort_contract_requires_world_account_binding',
    ),
    population: {
      activeHouseholds,
      pausedHouseholds: 0,
      insolventHouseholds: 0,
      exitedHouseholds: 0,
      entrantReserve,
      entrantCapitalPoolCents: entrantReserve * 120_000,
      capitalPerEntrantCents: 120_000,
    },
    behavior: {
      arrivalRatePpm,
      typicalLotUnits,
      priceSensitivityPpm,
      limitPreferencePpm,
      attentionSensitivityPpm,
      dispositionPpm,
      liquidityNeedPpm,
      minimumHouseholdReserveCents: 80_000,
    },
    mandate: {
      maxGrossCents: cashCents * 2,
      maxOrderUnits: Math.max(1, typicalLotUnits * Math.ceil(activeHouseholds / 5)),
      maxPositionUnits: Math.max(1, holdingUnits * 4),
      maxParticipationPpm: 35_000,
      permittedSides: ['buy', 'sell'],
      leverageAllowed: false,
      shortingAllowed: false,
    },
    attention: Object.fromEntries(symbols.map((symbol) => [symbol, 0])),
    obligations: {
      scheduledLiquidityNeedCents: 0,
      debtServiceCents: 0,
      incomeBufferCents: Math.round(cashCents * 0.08),
    },
    learning: makeLearning(learning),
    performance: makePerformance(),
    status: 'active',
  };
}

function createRetailCohorts({ symbols, actorBindings, retailIntensityPpm }) {
  const intensity = Math.max(1, retailIntensityPpm);
  const cohort = (options) => retailTemplate({
    ...options,
    symbols,
    actorBindings,
    arrivalRatePpm: clamp(
      Math.round(options.arrivalRatePpm * intensity / PPM),
      1,
      PPM,
    ),
  });
  const templates = [
    cohort({
      id: 'retail_attention_chasers',
      archetype: 'attention_momentum_new_buyers',
      decisionPipeline: 'attention_candidate_then_budget_gate',
      cashCents: 48_000_000,
      holdingUnits: 5_000,
      activeHouseholds: 160,
      entrantReserve: 45,
      arrivalRatePpm: 420_000,
      typicalLotUnits: 100,
      priceSensitivityPpm: 420_000,
      limitPreferencePpm: 460_000,
      attentionSensitivityPpm: 820_000,
      dispositionPpm: 180_000,
      liquidityNeedPpm: 120_000,
      learning: {
        aggressivenessPpm: 610_000,
        explorationPpm: 170_000,
      },
    }),
    cohort({
      id: 'retail_disposition_limit',
      archetype: 'disposition_limit_sellers',
      decisionPipeline: 'reference_price_limit_supply',
      cashCents: 38_000_000,
      holdingUnits: 7_000,
      activeHouseholds: 135,
      entrantReserve: 30,
      arrivalRatePpm: 330_000,
      typicalLotUnits: 100,
      priceSensitivityPpm: 760_000,
      limitPreferencePpm: 840_000,
      attentionSensitivityPpm: 280_000,
      dispositionPpm: 790_000,
      liquidityNeedPpm: 150_000,
      learning: {
        aggressivenessPpm: 270_000,
        explorationPpm: 90_000,
      },
    }),
    cohort({
      id: 'retail_liquidity_need',
      archetype: 'household_liquidity_need',
      decisionPipeline: 'cash_obligation_override',
      cashCents: 31_000_000,
      holdingUnits: 6_500,
      activeHouseholds: 110,
      entrantReserve: 25,
      arrivalRatePpm: 290_000,
      typicalLotUnits: 100,
      priceSensitivityPpm: 340_000,
      limitPreferencePpm: 330_000,
      attentionSensitivityPpm: 180_000,
      dispositionPpm: 320_000,
      liquidityNeedPpm: 880_000,
      learning: {
        aggressivenessPpm: 710_000,
        explorationPpm: 60_000,
      },
    }),
    cohort({
      id: 'retail_adaptive_learners',
      archetype: 'adaptive_mixed_retail',
      decisionPipeline: 'strategy_weight_learning_and_selection',
      cashCents: 42_000_000,
      holdingUnits: 5_500,
      activeHouseholds: 125,
      entrantReserve: 40,
      arrivalRatePpm: 360_000,
      typicalLotUnits: 100,
      priceSensitivityPpm: 520_000,
      limitPreferencePpm: 550_000,
      attentionSensitivityPpm: 460_000,
      dispositionPpm: 360_000,
      liquidityNeedPpm: 250_000,
      learning: {
        aggressivenessPpm: 480_000,
        explorationPpm: 240_000,
        learningRatePpm: 180_000,
      },
    }),
  ];
  return Object.fromEntries(
    templates.map((participant) => [participant.id, participant]),
  );
}

function validateCreateOptions(options) {
  if (!options || typeof options !== 'object') {
    throw new TypeError('institutional ecology options are required');
  }
  if (typeof options.seed !== 'string' || options.seed.length === 0) {
    throw new TypeError('seed must be a non-empty string');
  }
  if (!Array.isArray(options.symbols) || options.symbols.length < 2) {
    throw new TypeError('at least two symbols are required');
  }
  if (new Set(options.symbols).size !== options.symbols.length) {
    throw new TypeError('symbols must be unique');
  }
  for (const symbol of options.symbols) {
    if (typeof symbol !== 'string' || symbol.length === 0) {
      throw new TypeError('symbols must be non-empty strings');
    }
    if (!isPositiveInteger(options.initialPricesTicks?.[symbol])) {
      throw new TypeError(`initial price missing for ${symbol}`);
    }
  }
  if (!ALLOWED_REGIMES.has(options.regime)) {
    throw new TypeError(`unsupported regime: ${options.regime}`);
  }
}

/**
 * Creates strategy state only.  `actorBindings` are explicit permissions to
 * route intents to pre-existing realtime accounts; missing bindings fail
 * closed and remain contract-only.
 */
export function createInstitutionalEcology(options) {
  validateCreateOptions(options);
  const symbols = sortedSymbols(options.symbols);
  const capitalScalePpm =
    options.capitalScalePpm ?? DEFAULT_CAPITAL_SCALE_PPM;
  if (!isPositiveInteger(capitalScalePpm)) {
    throw new TypeError('capitalScalePpm must be a positive integer');
  }
  const actorBindings = cloneJson(options.actorBindings ?? {});
  const institutions = createInstitutions({
    symbols,
    actorBindings,
    capitalScalePpm,
  });
  const retail = createRetailCohorts({
    symbols,
    actorBindings,
    retailIntensityPpm: options.retailIntensityPpm ?? PPM,
  });
  const participants = { ...institutions, ...retail };
  attachValuationPolicies(participants);
  const state = {
    ruleVersion: INSTITUTIONAL_ECOLOGY_RULE_VERSION,
    seed: options.seed,
    rngState: hashSeed(options.seed),
    nowMs: 0,
    regime: options.regime,
    timingContract: {
      quoteFrameMs: ECOLOGY_FRAME_MS,
      worldDayMs: ECOLOGY_WORLD_DAY_MS,
      speedMultipliers: cloneJson(ECOLOGY_SPEED_MULTIPLIERS),
      clockAuthority: 'realtime_worker_not_this_module',
    },
    authorityBoundary: {
      matching: 'external_realtime_simulator',
      cashLedger: 'external_realtime_simulator',
      securitiesLedger: 'external_realtime_simulator',
      tradedPrice: 'external_realtime_order_book_fills',
      worldFacts: 'external_world_settlement',
    },
    symbols,
    initialPricesTicks: cloneJson(options.initialPricesTicks),
    valuationInputContractVersion: INSTITUTIONAL_VALUATION_INPUT_VERSION,
    enterpriseValuationFacts: {},
    enterpriseValuationHistory: Object.fromEntries(
      symbols.map((symbol) => [symbol, []]),
    ),
    capitalScalePpm,
    actorBindings,
    participants,
    participantOrder: Object.keys(participants),
    history: Object.fromEntries(
      symbols.map((symbol) => [
        symbol,
        [{
          virtualMs: 0,
          priceTicks: options.initialPricesTicks[symbol],
        }],
      ]),
    ),
    latestFrame: null,
    publicEvents: {},
    parentOrders: {},
    intentCapabilities: {},
    pendingRetailEntryRequests: {},
    disruptionIntents: [],
    nextParentSequence: 1,
    nextRetailEntrySequence: 1,
    nextIntentSequence: 1,
    observedSettlements: [],
  };
  const errors = ecologyInvariantErrors(state);
  if (errors.length) {
    throw new Error(`invalid institutional ecology: ${errors.join(', ')}`);
  }
  return state;
}

export function wallMsToVirtualMs(wallMs, speed) {
  if (!Number.isSafeInteger(wallMs) || wallMs < 0) {
    throw new TypeError('wallMs must be a non-negative integer');
  }
  const multiplier = ECOLOGY_SPEED_MULTIPLIERS[speed];
  if (!multiplier) throw new RangeError('speed must be 1, 4, or 16');
  const virtualMs = wallMs * multiplier;
  if (!Number.isSafeInteger(virtualMs)) {
    throw new RangeError('virtual time exceeds safe integer range');
  }
  return virtualMs;
}

function multiplyDivideRound(value, multiplier, divisor) {
  if (
    !Number.isSafeInteger(value) ||
    !Number.isSafeInteger(multiplier) ||
    !isPositiveInteger(divisor)
  ) {
    throw new TypeError('integer multiply/divide inputs are required');
  }
  const numerator = BigInt(value) * BigInt(multiplier);
  const denominator = BigInt(divisor);
  const half = denominator / 2n;
  const rounded = numerator >= 0n
    ? (numerator + half) / denominator
    : (numerator - half) / denominator;
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) {
    throw new RangeError('valuation calculation exceeds safe integer range');
  }
  return result;
}

function weightedInteger(left, right, rightWeightPpm) {
  return (
    multiplyDivideRound(left, PPM - rightWeightPpm, PPM) +
    multiplyDivideRound(right, rightWeightPpm, PPM)
  );
}

function perShareTicks(totalCents, shares) {
  if (!isPositiveInteger(shares)) {
    throw new TypeError('positive share count is required');
  }
  return Math.round(totalCents / shares);
}

function deterministicSignedNoisePpm({
  seed,
  actorId,
  symbol,
  publishedMs,
  noiseBandPpm,
}) {
  if (noiseBandPpm <= 0) return 0;
  const hash = hashSeed(
    `${seed}:${actorId}:${symbol}:${publishedMs}:valuation-noise`,
  );
  const span = noiseBandPpm * 2 + 1;
  return (hash % span) - noiseBandPpm;
}

function valuationEvidenceReliabilityPpm(observation) {
  return Math.round(
    average(
      observation.evidenceSources.map(
        (source) =>
          VALUATION_EVIDENCE_RELIABILITY_PPM[source.authority],
      ),
    ),
  );
}

export function validateEnterpriseValuationObservation(
  observation,
  expectedSymbol = null,
) {
  const errors = [];
  if (!observation || typeof observation !== 'object') {
    return ['INVALID_VALUATION_OBSERVATION'];
  }
  for (const key of Object.keys(observation)) {
    if (!VALUATION_OBSERVATION_FIELDS.has(key)) {
      errors.push('UNKNOWN_VALUATION_OBSERVATION_FIELD');
    }
  }
  if (
    observation.contractVersion !==
    INSTITUTIONAL_VALUATION_INPUT_VERSION
  ) {
    errors.push('VALUATION_CONTRACT_VERSION_MISMATCH');
  }
  if (
    typeof observation.symbol !== 'string' ||
    observation.symbol.length === 0 ||
    (expectedSymbol && observation.symbol !== expectedSymbol)
  ) {
    errors.push('VALUATION_SYMBOL_MISMATCH');
  }
  for (const key of ['asOfMs', 'publishedMs', 'expectedHorizonMs']) {
    if (!Number.isSafeInteger(observation[key]) || observation[key] < 0) {
      errors.push(`INVALID_${key.toUpperCase()}`);
    }
  }
  if (!isPositiveInteger(observation.expectedHorizonMs)) {
    errors.push('NON_POSITIVE_EXPECTED_HORIZON');
  }
  if (
    Number.isSafeInteger(observation.asOfMs) &&
    Number.isSafeInteger(observation.publishedMs) &&
    observation.asOfMs > observation.publishedMs
  ) {
    errors.push('VALUATION_AS_OF_AFTER_PUBLICATION');
  }
  if (
    !Number.isSafeInteger(observation.riskFreeRateBps) ||
    observation.riskFreeRateBps < -1_000 ||
    observation.riskFreeRateBps > 20_000
  ) {
    errors.push('INVALID_RISK_FREE_RATE_BPS');
  }
  if (
    !Number.isSafeInteger(observation.issuerCreditSpreadBps) ||
    observation.issuerCreditSpreadBps < 0 ||
    observation.issuerCreditSpreadBps > 50_000
  ) {
    errors.push('INVALID_ISSUER_CREDIT_SPREAD_BPS');
  }
  if (
    !Number.isSafeInteger(observation.longTermGrowthPpm) ||
    observation.longTermGrowthPpm < -500_000 ||
    observation.longTermGrowthPpm > 500_000
  ) {
    errors.push('INVALID_LONG_TERM_GROWTH_PPM');
  }
  const financialKeys = [
    'ttmRevenueCents',
    'ttmNetProfitCents',
    'ttmFreeCashFlowCents',
    'expectedRevenueCents',
    'expectedNetProfitCents',
    'expectedFreeCashFlowCents',
    'bookEquityCents',
    'netDebtCents',
    'dividendsPaidCents',
    'buybackCashPaidCents',
    'issuanceProceedsCents',
  ];
  for (const key of financialKeys) {
    if (!Number.isSafeInteger(observation[key])) {
      errors.push(`INVALID_${key.toUpperCase()}`);
    }
  }
  if (
    Number.isSafeInteger(observation.ttmRevenueCents) &&
    observation.ttmRevenueCents < 0
  ) {
    errors.push('NEGATIVE_TTM_REVENUE');
  }
  if (
    Number.isSafeInteger(observation.expectedRevenueCents) &&
    observation.expectedRevenueCents < 0
  ) {
    errors.push('NEGATIVE_EXPECTED_REVENUE');
  }
  if (
    Number.isSafeInteger(observation.dividendsPaidCents) &&
    observation.dividendsPaidCents < 0
  ) {
    errors.push('NEGATIVE_DIVIDENDS');
  }
  if (
    Number.isSafeInteger(observation.buybackCashPaidCents) &&
    observation.buybackCashPaidCents < 0
  ) {
    errors.push('NEGATIVE_BUYBACK_CASH');
  }
  if (
    Number.isSafeInteger(observation.issuanceProceedsCents) &&
    observation.issuanceProceedsCents < 0
  ) {
    errors.push('NEGATIVE_ISSUANCE_PROCEEDS');
  }
  for (const key of [
    'floatShares',
    'totalShares',
    'dilutedShares',
    'periodStartTotalShares',
    'buybackShares',
    'newSharesIssued',
  ]) {
    if (!Number.isSafeInteger(observation[key]) || observation[key] < 0) {
      errors.push(`INVALID_${key.toUpperCase()}`);
    }
  }
  if (!isPositiveInteger(observation.totalShares)) {
    errors.push('NON_POSITIVE_TOTAL_SHARES');
  }
  if (!isPositiveInteger(observation.dilutedShares)) {
    errors.push('NON_POSITIVE_DILUTED_SHARES');
  }
  if (!isPositiveInteger(observation.periodStartTotalShares)) {
    errors.push('NON_POSITIVE_PERIOD_START_TOTAL_SHARES');
  }
  if (!isPositiveInteger(observation.floatShares)) {
    errors.push('NON_POSITIVE_FLOAT_SHARES');
  }
  if (
    Number.isSafeInteger(observation.floatShares) &&
    Number.isSafeInteger(observation.totalShares) &&
    observation.floatShares > observation.totalShares
  ) {
    errors.push('FLOAT_SHARES_EXCEED_TOTAL');
  }
  if (
    Number.isSafeInteger(observation.dilutedShares) &&
    Number.isSafeInteger(observation.totalShares) &&
    observation.dilutedShares < observation.totalShares
  ) {
    errors.push('DILUTED_SHARES_BELOW_TOTAL');
  }
  if (
    !Number.isSafeInteger(observation.shareCountPeriodStartMs) ||
    observation.shareCountPeriodStartMs < 0 ||
    (
      Number.isSafeInteger(observation.asOfMs) &&
      observation.shareCountPeriodStartMs > observation.asOfMs
    )
  ) {
    errors.push('INVALID_SHARE_COUNT_PERIOD_START');
  }
  if (
    Number.isSafeInteger(observation.periodStartTotalShares) &&
    Number.isSafeInteger(observation.newSharesIssued) &&
    Number.isSafeInteger(observation.buybackShares) &&
    Number.isSafeInteger(observation.totalShares) &&
    observation.periodStartTotalShares +
      observation.newSharesIssued -
      observation.buybackShares !== observation.totalShares
  ) {
    errors.push('SHARE_COUNT_ROLL_FORWARD_MISMATCH');
  }
  if (
    Number.isSafeInteger(observation.buybackShares) &&
    observation.buybackShares > 0 &&
    (
      !Number.isSafeInteger(observation.buybackCashPaidCents) ||
      observation.buybackCashPaidCents <= 0
    )
  ) {
    errors.push('BUYBACK_CASH_REQUIRED');
  }
  if (
    Number.isSafeInteger(observation.newSharesIssued) &&
    observation.newSharesIssued > 0 &&
    (
      !Number.isSafeInteger(observation.issuanceProceedsCents) ||
      observation.issuanceProceedsCents <= 0
    )
  ) {
    errors.push('ISSUANCE_PROCEEDS_REQUIRED');
  }
  if (observation.capitalActionsReflectedInFinancials !== true) {
    errors.push('CAPITAL_ACTION_ACCOUNTING_NOT_CONFIRMED');
  }
  if (
    !Number.isSafeInteger(observation.confidenceIntervalPpm?.low) ||
    !Number.isSafeInteger(observation.confidenceIntervalPpm?.high) ||
    observation.confidenceIntervalPpm.low <= 0 ||
    observation.confidenceIntervalPpm.low > PPM ||
    observation.confidenceIntervalPpm.high < PPM ||
    observation.confidenceIntervalPpm.high >
      2_000_000 ||
    observation.confidenceIntervalPpm.low >
      observation.confidenceIntervalPpm.high
  ) {
    errors.push('INVALID_CONFIDENCE_INTERVAL');
  }
  if (
    !Array.isArray(observation.evidenceSources) ||
    observation.evidenceSources.length === 0
  ) {
    errors.push('MISSING_EVIDENCE_SOURCES');
  } else {
    const sourceIds = new Set();
    for (const source of observation.evidenceSources) {
      if (
        source &&
        typeof source === 'object' &&
        Object.keys(source).some(
          (key) => !VALUATION_EVIDENCE_SOURCE_FIELDS.has(key),
        )
      ) {
        errors.push('UNKNOWN_VALUATION_EVIDENCE_SOURCE_FIELD');
      }
      if (
        typeof source?.id !== 'string' ||
        source.id.length === 0 ||
        typeof source?.kind !== 'string' ||
        source.kind.length === 0 ||
        typeof source?.authority !== 'string' ||
        source.authority.length === 0 ||
        source.visibility !== 'public' ||
        !Number.isSafeInteger(source.publishedMs) ||
        source.publishedMs < 0 ||
        source.publishedMs > observation.publishedMs ||
        !Array.isArray(source.factIds) ||
        source.factIds.length === 0 ||
        source.factIds.some(
          (factId) => typeof factId !== 'string' || factId.length === 0,
        )
      ) {
        errors.push('INVALID_EVIDENCE_SOURCE');
        break;
      }
      if (sourceIds.has(source.id)) {
        errors.push('DUPLICATE_EVIDENCE_SOURCE_ID');
      }
      sourceIds.add(source.id);
      if (new Set(source.factIds).size !== source.factIds.length) {
        errors.push('DUPLICATE_EVIDENCE_FACT_ID');
      }
      if (
        !Object.hasOwn(
          VALUATION_EVIDENCE_AUTHORITIES_BY_KIND,
          source.kind,
        ) ||
        !Object.hasOwn(
          VALUATION_EVIDENCE_RELIABILITY_PPM,
          source.authority,
        )
      ) {
        errors.push('FORBIDDEN_VALUATION_EVIDENCE_SOURCE');
      } else if (
        !VALUATION_EVIDENCE_AUTHORITIES_BY_KIND[source.kind]
          .includes(source.authority)
      ) {
        errors.push('EVIDENCE_KIND_AUTHORITY_MISMATCH');
      }
    }
  }
  const derivation = observation.derivation;
  const fieldFactIds = derivation?.fieldFactIds;
  const fieldFactIdKeys =
    fieldFactIds &&
    typeof fieldFactIds === 'object' &&
    !Array.isArray(fieldFactIds)
      ? Object.keys(fieldFactIds).sort(
          (left, right) => left.localeCompare(right),
        )
      : [];
  const expectedFieldFactIdKeys = [
    ...VALUATION_LINEAGED_FIELDS,
  ].sort((left, right) => left.localeCompare(right));
  const fieldFactIdsValid =
    stableStringify(fieldFactIdKeys) ===
      stableStringify(expectedFieldFactIdKeys) &&
    fieldFactIdKeys.every((field) =>
      Array.isArray(fieldFactIds[field]) &&
      fieldFactIds[field].length > 0 &&
      fieldFactIds[field].every(
        (factId) =>
          typeof factId === 'string' && factId.length > 0,
      ) &&
      new Set(fieldFactIds[field]).size ===
        fieldFactIds[field].length,
    );
  if (
    !derivation ||
    typeof derivation !== 'object' ||
    Object.keys(derivation).some(
      (key) => !VALUATION_DERIVATION_FIELDS.has(key),
    ) ||
    !ALLOWED_VALUATION_DERIVATION_KINDS.has(derivation.kind) ||
    !Array.isArray(derivation.inputFactIds) ||
    derivation.inputFactIds.length === 0 ||
    derivation.inputFactIds.some(
      (factId) => typeof factId !== 'string' || factId.length === 0,
    ) ||
    new Set(derivation.inputFactIds).size !==
      derivation.inputFactIds.length ||
    !fieldFactIdsValid ||
    derivation.excludesMarketPriceInputs !== true
  ) {
    errors.push('INVALID_VALUATION_DERIVATION_LINEAGE');
  } else if (Array.isArray(observation.evidenceSources)) {
    const derivationFactIds = [...derivation.inputFactIds].sort();
    const evidenceFactIds = [
      ...new Set(
        observation.evidenceSources.flatMap(
          (source) =>
            Array.isArray(source?.factIds) ? source.factIds : [],
        ),
      ),
    ].sort();
    if (
      stableStringify(derivationFactIds) !==
      stableStringify(evidenceFactIds)
    ) {
      errors.push('DERIVATION_EVIDENCE_FACT_SET_MISMATCH');
    }
    const mappedFieldFactIds = [
      ...new Set(
        Object.values(fieldFactIds).flat(),
      ),
    ].sort();
    if (
      Object.values(fieldFactIds).some((factIds) =>
        factIds.some(
          (factId) => !derivation.inputFactIds.includes(factId),
        ),
      ) ||
      stableStringify(mappedFieldFactIds) !==
        stableStringify(derivationFactIds)
    ) {
      errors.push('FIELD_FACT_LINEAGE_MISMATCH');
    }
  }
  if (
    observation.peMilli !== undefined ||
    observation.pbMilli !== undefined ||
    observation.fcfYieldPpm !== undefined ||
    observation.priceAnchorTicks !== undefined
  ) {
    errors.push('DERIVED_MARKET_MULTIPLES_FORBIDDEN_IN_FACT_INPUT');
  }
  return [...new Set(errors)];
}

/**
 * Converts enterprise facts to one actor's valuation distribution.  The
 * central value is derived without the market price; price is used only after
 * that calculation for diagnostic P/E, P/B, FCF-yield and actionable upside.
 */
export function deriveInstitutionValuationView(
  observation,
  policy,
  {
    seed,
    actorId,
    marketPriceTicks,
    crowdingPpm = 0,
  },
) {
  const errors = validateEnterpriseValuationObservation(
    observation,
    observation?.symbol,
  );
  if (errors.length) {
    throw new TypeError(`invalid valuation observation: ${errors.join(', ')}`);
  }
  if (!policy || !policy.methodWeightsPpm) {
    return {
      status: 'NO_INVESTMENT_VALUATION_BY_MANDATE',
      symbol: observation.symbol,
      observationPublishedMs: observation.publishedMs,
      sourceEvidenceIds: observation.evidenceSources.map(
        (source) => source.id,
      ),
    };
  }
  if (!isPositiveInteger(marketPriceTicks)) {
    throw new TypeError('positive marketPriceTicks is required for diagnostics');
  }
  const weights = policy.methodWeightsPpm;
  const weightTotal = Object.values(weights)
    .reduce((sum, value) => sum + value, 0);
  if (weightTotal !== PPM) {
    throw new TypeError('valuation method weights must total 1,000,000 ppm');
  }
  const horizonAlignmentPpm = clamp(
    safeRatioPpm(policy.horizonMs, observation.expectedHorizonMs),
    0,
    PPM,
  );
  const effectiveForwardWeightPpm = multiplyDivideRound(
    policy.forwardWeightPpm,
    horizonAlignmentPpm,
    PPM,
  );
  const blendedProfitCents = weightedInteger(
    observation.ttmNetProfitCents,
    observation.expectedNetProfitCents,
    effectiveForwardWeightPpm,
  );
  const blendedFreeCashFlowCents = weightedInteger(
    observation.ttmFreeCashFlowCents,
    observation.expectedFreeCashFlowCents,
    effectiveForwardWeightPpm,
  );
  const longTermGrowthBps = Math.round(
    observation.longTermGrowthPpm / 100,
  );
  const requiredReturnBps =
    observation.riskFreeRateBps +
    observation.issuerCreditSpreadBps +
    policy.equityRiskPremiumBps;
  const growthCapitalizationOffsetBps = multiplyDivideRound(
    longTermGrowthBps,
    policy.growthPassThroughPpm,
    PPM,
  );
  const capitalizationRateBps = Math.max(
    100,
    requiredReturnBps - growthCapitalizationOffsetBps,
  );
  const rawDynamicMultipleFactorPpm = clamp(
    safeRatioPpm(
      policy.referenceCapitalizationRateBps,
      capitalizationRateBps,
    ),
    300_000,
    2_000_000,
  );
  const methodRateSensitivityPpm = {
    earnings: 850_000,
    book: 400_000,
    freeCashFlow: 1_000_000,
    distribution: 1_000_000,
  };
  const baseMultiplesMilli =
    policy.multiplesBySymbolMilli?.[
      observation.symbol
    ] ?? policy.multiplesMilli;
  const dynamicMultiplesMilli = Object.fromEntries(
    Object.entries(baseMultiplesMilli).map(
      ([method, baseMultipleMilli]) => {
        const combinedSensitivityPpm = multiplyDivideRound(
          policy.rateSensitivityPpm,
          methodRateSensitivityPpm[method],
          PPM,
        );
        const appliedFactorPpm =
          PPM +
          multiplyDivideRound(
            rawDynamicMultipleFactorPpm - PPM,
            combinedSensitivityPpm,
            PPM,
          );
        return [
          method,
          Math.max(
            100,
            multiplyDivideRound(
              baseMultipleMilli,
              appliedFactorPpm,
              PPM,
            ),
          ),
        ];
      },
    ),
  );
  const earningsEquityCents = multiplyDivideRound(
    blendedProfitCents,
    dynamicMultiplesMilli.earnings,
    1_000,
  );
  const bookEquityCents = multiplyDivideRound(
    observation.bookEquityCents,
    dynamicMultiplesMilli.book,
    1_000,
  );
  const freeCashFlowEnterpriseCents = multiplyDivideRound(
    blendedFreeCashFlowCents,
    dynamicMultiplesMilli.freeCashFlow,
    1_000,
  );
  // The input contract defines free cash flow as FCFE after debt service.
  // Net debt therefore enters once through the separate distress discount.
  const freeCashFlowEquityCents = freeCashFlowEnterpriseCents;
  const distributionEquityCents = multiplyDivideRound(
    observation.dividendsPaidCents,
    dynamicMultiplesMilli.distribution,
    1_000,
  );
  const methodValuesTicks = {
    earnings: perShareTicks(
      earningsEquityCents,
      observation.dilutedShares,
    ),
    book: perShareTicks(
      bookEquityCents,
      observation.dilutedShares,
    ),
    freeCashFlow: perShareTicks(
      freeCashFlowEquityCents,
      observation.dilutedShares,
    ),
    distribution: perShareTicks(
      distributionEquityCents,
      observation.dilutedShares,
    ),
  };
  let weightedValueTicks = Object.entries(weights)
    .reduce(
      (sum, [method, weightPpm]) =>
        sum +
        multiplyDivideRound(methodValuesTicks[method], weightPpm, PPM),
      0,
    );
  const revenueGrowthPpm = safeRatioPpm(
    observation.expectedRevenueCents - observation.ttmRevenueCents,
    Math.max(1, observation.ttmRevenueCents),
  );
  const growthQualityAdjustmentPpm = clamp(
    multiplyDivideRound(
      Math.round(revenueGrowthPpm * 0.15),
      horizonAlignmentPpm,
      PPM,
    ),
    -120_000,
    120_000,
  );
  const debtBaseCents = Math.max(
    1,
    Math.abs(observation.bookEquityCents),
    Math.abs(blendedFreeCashFlowCents) * 6,
  );
  const debtPressurePpm = safeRatioPpm(
    observation.netDebtCents,
    debtBaseCents,
  );
  const debtAdjustmentPpm = clamp(
    -multiplyDivideRound(
      debtPressurePpm,
      policy.debtPenaltyPpm,
      PPM,
    ),
    -650_000,
    160_000,
  );
  const preActionShares = Math.max(
    1,
    observation.totalShares -
      observation.newSharesIssued +
      observation.buybackShares,
  );
  const dilutionPpm = safeRatioPpm(
    observation.newSharesIssued,
    preActionShares,
  );
  const buybackPpm = safeRatioPpm(
    observation.buybackShares,
    Math.max(1, preActionShares),
  );
  weightedValueTicks = multiplyDivideRound(
    weightedValueTicks,
    PPM +
      growthQualityAdjustmentPpm +
      debtAdjustmentPpm,
    PPM,
  );
  const noisePpm = deterministicSignedNoisePpm({
    seed,
    actorId,
    symbol: observation.symbol,
    publishedMs: observation.publishedMs,
    noiseBandPpm: policy.noiseBandPpm,
  });
  const noisyCentralTicks = Math.max(
    1,
    multiplyDivideRound(
      weightedValueTicks,
      PPM + noisePpm,
      PPM,
    ),
  );
  const lowTicks = Math.max(
    1,
    multiplyDivideRound(
      noisyCentralTicks,
      observation.confidenceIntervalPpm.low,
      PPM,
    ),
  );
  const highTicks = Math.max(
    lowTicks,
    multiplyDivideRound(
      noisyCentralTicks,
      observation.confidenceIntervalPpm.high,
      PPM,
    ),
  );
  const crowdingHaircutPpm = clamp(
    multiplyDivideRound(
      crowdingPpm,
      policy.crowdingMarginPpm,
      PPM,
    ),
    0,
    500_000,
  );
  const confidenceHalfWidthPpm = Math.ceil(
    (
      observation.confidenceIntervalPpm.high -
      observation.confidenceIntervalPpm.low
    ) / 2,
  );
  const confidenceHaircutPpm = clamp(
    multiplyDivideRound(
      confidenceHalfWidthPpm,
      policy.uncertaintyAversionPpm,
      PPM,
    ),
    0,
    500_000,
  );
  const evidenceReliabilityPpm =
    valuationEvidenceReliabilityPpm(observation);
  const evidenceHaircutPpm = clamp(
    multiplyDivideRound(
      PPM - evidenceReliabilityPpm,
      policy.evidenceSkepticismPpm,
      PPM,
    ),
    0,
    500_000,
  );
  const totalActionableHaircutPpm = clamp(
    crowdingHaircutPpm +
      confidenceHaircutPpm +
      evidenceHaircutPpm,
    0,
    800_000,
  );
  const actionableValueTicks = Math.max(
    1,
    multiplyDivideRound(
      noisyCentralTicks,
      PPM - totalActionableHaircutPpm,
      PPM,
    ),
  );
  const marketCapitalizationCents =
    marketPriceTicks * observation.totalShares;
  if (!Number.isSafeInteger(marketCapitalizationCents)) {
    throw new RangeError('market capitalization exceeds safe integer range');
  }
  const derivedMarketMetrics = {
    peMilli: observation.ttmNetProfitCents > 0
      ? Math.round(
          marketCapitalizationCents * 1_000 /
          observation.ttmNetProfitCents,
        )
      : null,
    pbMilli: observation.bookEquityCents > 0
      ? Math.round(
          marketCapitalizationCents * 1_000 /
          observation.bookEquityCents,
        )
      : null,
    fcfYieldPpm: marketCapitalizationCents > 0
      ? safeRatioPpm(
          observation.ttmFreeCashFlowCents,
          marketCapitalizationCents,
        )
      : null,
  };
  return {
    status: 'VALUED_FROM_ENTERPRISE_FACTS',
    contractVersion: observation.contractVersion,
    symbol: observation.symbol,
    asOfMs: observation.asOfMs,
    observationPublishedMs: observation.publishedMs,
    actorAvailableMs:
      observation.publishedMs + policy.observationDelayMs,
    horizonMs: policy.horizonMs,
    expectedHorizonMs: observation.expectedHorizonMs,
    horizonAlignmentPpm,
    effectiveForwardWeightPpm,
    floatShares: observation.floatShares,
    totalShares: observation.totalShares,
    dilutedShares: observation.dilutedShares,
    methodWeightsPpm: cloneJson(weights),
    baseMultiplesMilli: cloneJson(baseMultiplesMilli),
    dynamicMultiplesMilli,
    methodValuesTicks,
    centralTicks: noisyCentralTicks,
    actionableValueTicks,
    lowTicks,
    highTicks,
    valuationUpsidePpm: safeRatioPpm(
      actionableValueTicks - marketPriceTicks,
      marketPriceTicks,
    ),
    debtPressurePpm,
    riskFreeRateBps: observation.riskFreeRateBps,
    issuerCreditSpreadBps: observation.issuerCreditSpreadBps,
    longTermGrowthPpm: observation.longTermGrowthPpm,
    longTermGrowthBps,
    requiredReturnBps,
    growthCapitalizationOffsetBps,
    capitalizationRateBps,
    rawDynamicMultipleFactorPpm,
    dilutionPpm,
    buybackPpm,
    shareCountBasis:
      'dilutedShares_as_of_completed_actions_no_double_count',
    freeCashFlowBasis: 'FCFE_after_debt_service',
    noisePpm,
    crowdingHaircutPpm,
    confidenceHalfWidthPpm,
    confidenceHaircutPpm,
    evidenceReliabilityPpm,
    evidenceHaircutPpm,
    totalActionableHaircutPpm,
    sourceEvidenceIds: observation.evidenceSources.map(
      (source) => source.id,
    ),
    derivedMarketMetrics,
    priceRole:
      'diagnostic_denominator_and_order_comparison_not_intrinsic_value_input',
  };
}

function ingestValuationObservations(state, frame) {
  if (frame.fundamentalsTicks !== undefined) {
    throw new TypeError(
      'fundamentalsTicks is forbidden; use versioned enterprise valuation observations',
    );
  }
  const observations = frame.valuationObservations;
  if (
    !observations ||
    typeof observations !== 'object' ||
    Array.isArray(observations)
  ) {
    throw new TypeError('valuationObservations are required');
  }
  const observedSymbols = Object.keys(observations).sort(
    (left, right) => left.localeCompare(right),
  );
  if (stableStringify(observedSymbols) !== stableStringify(state.symbols)) {
    throw new TypeError(
      'VALUATION_OBSERVATION_UNIVERSE_MISMATCH',
    );
  }
  for (const symbol of state.symbols) {
    const observation = observations[symbol];
    const errors = validateEnterpriseValuationObservation(
      observation,
      symbol,
    );
    if (errors.length) {
      throw new TypeError(
        `invalid valuation observation for ${symbol}: ${errors.join(', ')}`,
      );
    }
    if (observation.publishedMs > state.nowMs) {
      throw new RangeError(
        `future valuation observation for ${symbol}`,
      );
    }
    const current = state.enterpriseValuationFacts[symbol];
    if (
      current &&
      (
        observation.publishedMs < current.publishedMs ||
        (
          observation.publishedMs === current.publishedMs &&
          observation.asOfMs < current.asOfMs
        )
      )
    ) {
      throw new RangeError(`stale valuation observation for ${symbol}`);
    }
    if (
      current &&
      observation.publishedMs === current.publishedMs &&
      stableStringify(observation) !== stableStringify(current)
    ) {
      throw new RangeError(
        `conflicting valuation observation for ${symbol}`,
      );
    }
    const duplicate =
      current &&
      stableStringify(observation) === stableStringify(current);
    state.enterpriseValuationFacts[symbol] = cloneJson(observation);
    if (!duplicate) {
      const history = state.enterpriseValuationHistory[symbol];
      history.push(cloneJson(observation));
      if (history.length > MAX_HISTORY) history.shift();
    }
  }
}

function visibleValuationObservation(
  state,
  symbol,
  policy,
  virtualMs,
) {
  const history = state.enterpriseValuationHistory[symbol] ?? [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const observation = history[index];
    if (
      observation.publishedMs + policy.observationDelayMs <=
      virtualMs
    ) {
      return observation;
    }
  }
  return null;
}

function refreshParticipantValuationViews(state, participant, frame) {
  const policy = participant.valuationPolicy;
  if (!policy.methodWeightsPpm) {
    for (const symbol of state.symbols) {
      const observation = visibleValuationObservation(
        state,
        symbol,
        policy,
        frame.virtualMs,
      );
      if (!observation) continue;
      participant.valuationViews[symbol] =
        deriveInstitutionValuationView(
          observation,
          policy,
          {
            seed: state.seed,
            actorId: participant.id,
            marketPriceTicks: frame.pricesTicks[symbol],
            crowdingPpm: 0,
          },
        );
    }
    return;
  }
  const crowdingPpm = clamp(
    (participant.crowding?.capitalFollowingPpm ?? 0) +
      (participant.crowding?.holdingOverlapPpm ?? 0) +
      (participant.crowding?.synchronizedFlowPpm ?? 0),
    0,
    PPM,
  );
  for (const symbol of state.symbols) {
    const observation = visibleValuationObservation(
      state,
      symbol,
      policy,
      frame.virtualMs,
    );
    if (!observation) continue;
    const previousPublishedMs =
      participant.lastValuationObservationPublishedMs[symbol] ?? -1;
    if (observation.publishedMs < previousPublishedMs) continue;
    participant.valuationViews[symbol] =
      deriveInstitutionValuationView(
        observation,
        policy,
        {
          seed: state.seed,
          actorId: participant.id,
          marketPriceTicks: frame.pricesTicks[symbol],
          crowdingPpm,
        },
      );
    participant.lastValuationObservationPublishedMs[symbol] =
      observation.publishedMs;
  }
}

function refreshAllValuationViews(state, frame) {
  for (const participant of Object.values(state.participants)) {
    refreshParticipantValuationViews(state, participant, frame);
  }
}

function validateBoundAccountObservation(state, participant, account) {
  if (
    !account ||
    typeof account !== 'object' ||
    Array.isArray(account) ||
    Object.keys(account).some(
      (key) => !BOUND_ACCOUNT_OBSERVATION_FIELDS.has(key),
    )
  ) {
    throw new TypeError(
      `INVALID_BOUND_ACCOUNT_OBSERVATION:${participant.id}`,
    );
  }
  if (
    account.accountId !== participant.binding.accountId ||
    account.brokerId !== participant.binding.brokerId
  ) {
    throw new TypeError(
      `BOUND_ACCOUNT_IDENTITY_MISMATCH:${participant.id}`,
    );
  }
  if (
    !Number.isSafeInteger(account.commitSeq) ||
    account.commitSeq < 0
  ) {
    throw new TypeError(
      `INVALID_BOUND_ACCOUNT_COMMIT:${participant.id}`,
    );
  }
  if (account.commitSeq < participant.portfolio.observedCommitSeq) {
    throw new RangeError(
      `STALE_BOUND_ACCOUNT_OBSERVATION:${participant.id}`,
    );
  }
  if (!Number.isSafeInteger(account.cashCents) || account.cashCents < 0) {
    throw new TypeError(`invalid observed cash for ${participant.id}`);
  }
  if (!account.holdings || typeof account.holdings !== 'object') {
    throw new TypeError(`invalid observed holdings for ${participant.id}`);
  }
  for (const symbol of state.symbols) {
    const units = account.holdings[symbol];
    if (!Number.isSafeInteger(units) || units < 0) {
      throw new TypeError(
        `invalid observed holding for ${participant.id}:${symbol}`,
      );
    }
  }
  for (const key of [
    'drawdownBps',
    'fundingStressBps',
    'redemptionPressurePpm',
  ]) {
    if (
      account[key] !== undefined &&
      (
        !Number.isSafeInteger(account[key]) ||
        account[key] < 0
      )
    ) {
      throw new TypeError(
        `invalid observed account risk for ${participant.id}:${key}`,
      );
    }
  }
  const digest = stableStringify(account);
  if (
    account.commitSeq === participant.portfolio.observedCommitSeq &&
    participant.portfolio.observedAccountDigest !== null &&
    participant.portfolio.observedAccountDigest !== digest
  ) {
    throw new RangeError(
      `CONFLICTING_BOUND_ACCOUNT_OBSERVATION:${participant.id}`,
    );
  }
  return digest;
}

function validateFrame(state, frame) {
  if (!frame || typeof frame !== 'object') {
    throw new TypeError('market frame is required');
  }
  if (!Number.isSafeInteger(frame.virtualMs)) {
    throw new TypeError('virtualMs must be an integer');
  }
  if (frame.virtualMs <= state.nowMs) {
    throw new RangeError('virtualMs must advance monotonically');
  }
  if (frame.virtualMs % ECOLOGY_FRAME_MS !== 0) {
    throw new RangeError('virtualMs must be a 3,000ms quote-frame boundary');
  }
  for (const symbol of state.symbols) {
    if (!isPositiveInteger(frame.pricesTicks?.[symbol])) {
      throw new TypeError(`price missing for ${symbol}`);
    }
  }
  for (const participant of Object.values(state.participants)) {
    if (participant.binding.status === 'BOUND_TO_REALTIME_ACCOUNT') {
      const account = frame.ownAccounts?.[participant.id];
      if (!account) {
        throw new TypeError(
          `BOUND_ACCOUNT_OBSERVATION_REQUIRED:${participant.id}`,
        );
      }
      validateBoundAccountObservation(state, participant, account);
    }
  }
  for (const actorId of Object.keys(frame.ownAccounts ?? {})) {
    const participant = state.participants[actorId];
    if (
      !participant ||
      participant.binding.status !== 'BOUND_TO_REALTIME_ACCOUNT'
    ) {
      throw new TypeError(
        `OWN_ACCOUNT_OBSERVATION_WITHOUT_BINDING:${actorId}`,
      );
    }
  }
}

function refreshObservedAccounts(state, ownAccounts, observedFrameMs) {
  if (!ownAccounts || typeof ownAccounts !== 'object') return;
  if (!Number.isSafeInteger(observedFrameMs) || observedFrameMs < 0) {
    throw new TypeError('observedFrameMs must be a non-negative integer');
  }
  for (const [actorId, account] of Object.entries(ownAccounts)) {
    const participant = state.participants[actorId];
    if (!participant || !account) continue;
    const digest =
      validateBoundAccountObservation(state, participant, account);
    const holdings = {};
    for (const symbol of state.symbols) {
      holdings[symbol] = account.holdings[symbol];
    }
    participant.portfolio.cashCents = account.cashCents;
    participant.portfolio.holdings = holdings;
    participant.portfolio.observedCommitSeq = account.commitSeq;
    participant.portfolio.observedAccountDigest = digest;
    participant.portfolio.observedFrameMs = observedFrameMs;
    if (participant.kind === 'institution') {
      participant.observedRisk.drawdownBps = Math.max(
        0,
        Number.isSafeInteger(account.drawdownBps) ? account.drawdownBps : 0,
      );
      participant.observedRisk.fundingStressBps = Math.max(
        0,
        Number.isSafeInteger(account.fundingStressBps)
          ? account.fundingStressBps
          : 0,
      );
      participant.observedRisk.redemptionPressurePpm = clamp(
        Number.isSafeInteger(account.redemptionPressurePpm)
          ? account.redemptionPressurePpm
          : participant.liability.redemptionPressurePpm,
        0,
        PPM,
      );
    }
  }
}

function assertCurrentBoundAccountObservation(state, participant) {
  if (
    participant?.binding?.status !== 'BOUND_TO_REALTIME_ACCOUNT' ||
    typeof participant.binding.accountId !== 'string' ||
    typeof participant.binding.brokerId !== 'string'
  ) {
    throw new Error(
      `UNBOUND_NO_MARKET_AUTHORITY:${participant?.id ?? 'unknown'}`,
    );
  }
  if (
    participant.portfolio.observedAccountDigest === null ||
    participant.portfolio.observedFrameMs !== state.nowMs
  ) {
    throw new Error(
      `BOUND_ACCOUNT_OBSERVATION_REQUIRED:${participant.id}`,
    );
  }
  return participant.portfolio.observedAccountDigest;
}

function trimIntentCapabilityHistory(state) {
  const capabilities = Object.values(state.intentCapabilities);
  if (capabilities.length <= MAX_INTENT_CAPABILITY_HISTORY) return;
  const terminal = capabilities
    .filter((capability) => capability.status !== 'ISSUED')
    .sort((left, right) =>
      (left.terminalMs ?? left.issuedMs) -
        (right.terminalMs ?? right.issuedMs) ||
      left.id.localeCompare(right.id),
    );
  const removeCount =
    capabilities.length - MAX_INTENT_CAPABILITY_HISTORY;
  for (const capability of terminal.slice(0, removeCount)) {
    delete state.intentCapabilities[capability.id];
  }
}

function expireIssuedIntentCapabilities(state, nextFrameMs) {
  for (const capability of Object.values(state.intentCapabilities)) {
    if (capability.status !== 'ISSUED') continue;
    capability.status = 'EXPIRED_UNSUBMITTED';
    capability.terminalMs = nextFrameMs;
  }
  trimIntentCapabilityHistory(state);
}

function registerIntentCapability(state, intent, source) {
  if (
    !intent ||
    typeof intent.id !== 'string' ||
    intent.id.length === 0 ||
    !isPositiveInteger(intent.quantity)
  ) {
    throw new TypeError('positive identified intent is required');
  }
  if (state.intentCapabilities[intent.id]) {
    throw new Error(`DUPLICATE_INTENT_CAPABILITY:${intent.id}`);
  }
  const participant = state.participants[intent.actorId];
  const observedAccountDigest =
    assertCurrentBoundAccountObservation(state, participant);
  state.intentCapabilities[intent.id] = {
    id: intent.id,
    actorId: participant.id,
    accountId: participant.binding.accountId,
    brokerId: participant.binding.brokerId,
    issuedMs: state.nowMs,
    observedFrameMs: participant.portfolio.observedFrameMs,
    observedCommitSeq: participant.portfolio.observedCommitSeq,
    observedAccountDigest,
    intentDigest: stableStringify(intent),
    source,
    status: 'ISSUED',
    terminalMs: null,
  };
  trimIntentCapabilityHistory(state);
}

function appendHistory(state, frame) {
  for (const symbol of state.symbols) {
    state.history[symbol].push({
      virtualMs: frame.virtualMs,
      priceTicks: frame.pricesTicks[symbol],
    });
    if (state.history[symbol].length > MAX_HISTORY) {
      state.history[symbol].splice(
        0,
        state.history[symbol].length - MAX_HISTORY,
      );
    }
  }
}

function ingestPublicEvents(state, frame) {
  for (const event of frame.publicEvents ?? []) {
    if (!event || typeof event.id !== 'string' || !event.id) continue;
    if (!state.symbols.includes(event.symbol)) continue;
    if (!Number.isSafeInteger(event.expiryMs) ||
        event.expiryMs <= frame.virtualMs) {
      continue;
    }
    state.publicEvents[event.id] = cloneJson(event);
    state.participants.inst_event_driven.model.events[event.id] =
      cloneJson(event);
  }
  for (const [eventId, event] of Object.entries(state.publicEvents)) {
    if (event.expiryMs <= frame.virtualMs) {
      delete state.publicEvents[eventId];
      delete state.participants.inst_event_driven.model.events[eventId];
    }
  }
}

function latestPriceHistory(state, symbol, offset = 0) {
  const history = state.history[symbol];
  const index = Math.max(0, history.length - 1 - offset);
  return history[index].priceTicks;
}

function priceChangePpm(state, symbol, offset) {
  const current = latestPriceHistory(state, symbol, 0);
  const prior = latestPriceHistory(state, symbol, offset);
  return safeRatioPpm(current - prior, Math.max(1, prior));
}

function chooseMax(items, score) {
  return [...items].sort((left, right) =>
    score(right) - score(left) ||
    String(left).localeCompare(String(right)),
  )[0];
}

function chooseByAbsoluteScore(scoreBySymbol) {
  return Object.keys(scoreBySymbol).sort((left, right) =>
    Math.abs(scoreBySymbol[right]) - Math.abs(scoreBySymbol[left]) ||
    left.localeCompare(right),
  )[0];
}

function availableUnits(participant, symbol, side, priceTicks) {
  if (side === 'buy') {
    const minimumCash =
      participant.portfolio.cashCents *
      (participant.mandate.liquidityReservePpm ?? 0) / PPM;
    const spendable = Math.max(
      0,
      participant.portfolio.cashCents - Math.ceil(minimumCash),
    );
    return Math.floor(spendable / Math.max(1, priceTicks + 1));
  }
  return participant.portfolio.holdings[symbol] ?? 0;
}

function assessNewRiskBoundary(
  state,
  participant,
  frame,
  symbol,
  side,
  priceTicks,
) {
  const currentPositionUnits =
    participant.portfolio.holdings[symbol] ?? 0;
  const remainingPositionUnits = side === 'buy'
    ? Math.max(
        0,
        participant.mandate.maxPositionUnits -
          currentPositionUnits,
      )
    : currentPositionUnits;
  const currentGrossCents = state.symbols.reduce(
    (sum, candidate) => {
      const positionValue =
        (participant.portfolio.holdings[candidate] ?? 0) *
        frame.pricesTicks[candidate];
      const next = sum + positionValue;
      if (!Number.isSafeInteger(next)) {
        throw new RangeError('portfolio gross exceeds safe integer range');
      }
      return next;
    },
    0,
  );
  const remainingGrossUnits = side === 'buy'
    ? Math.floor(
        Math.max(
          0,
          participant.mandate.maxGrossCents -
            currentGrossCents,
        ) / Math.max(1, priceTicks),
      )
    : currentPositionUnits;
  const authorizationActive =
    state.nowMs <= participant.authorization.expiresMs;
  const authorizationUnits = side === 'sell'
    ? currentPositionUnits
    : authorizationActive
      ? Math.floor(
          participant.authorization.remainingCents /
            Math.max(1, priceTicks),
        )
      : 0;
  const resourceUnits =
    availableUnits(participant, symbol, side, priceTicks);
  const maximumExposureUnits = Math.max(
    0,
    Math.min(
      resourceUnits,
      remainingPositionUnits,
      remainingGrossUnits,
      authorizationUnits,
    ),
  );
  return {
    authorizationActive,
    authorizationRemainingCents:
      participant.authorization.remainingCents,
    authorizationExpiresMs: participant.authorization.expiresMs,
    currentPositionUnits,
    remainingPositionUnits,
    currentGrossCents,
    remainingGrossCents: Math.max(
      0,
      participant.mandate.maxGrossCents - currentGrossCents,
    ),
    remainingGrossUnits,
    authorizationUnits,
    resourceUnits,
    maximumExposureUnits,
    maximumChildUnits: Math.min(
      maximumExposureUnits,
      participant.mandate.maxOrderUnits,
    ),
  };
}

function executionPriceTicks(participant, frame, symbol, side) {
  const mid = frame.pricesTicks[symbol];
  const urgency = participant.learning.aggressivenessPpm;
  const offset = Math.max(1, Math.ceil(urgency / 170_000));
  return side === 'buy'
    ? mid + offset
    : Math.max(1, mid - offset);
}

function intentScheduleMs(state) {
  const offset = 1 + nextRandomUint(state) % (ECOLOGY_FRAME_MS - 1);
  return state.nowMs + offset;
}

function neutralDecision(participant, reason) {
  return {
    id: null,
    actorId: participant.id,
    symbol: null,
    side: null,
    quantity: 0,
    priceTicks: null,
    tif: 'IOC',
    scheduledMs: null,
    reason,
  };
}

function decisionFromSignal(
  state,
  participant,
  frame,
  {
    symbol,
    scorePpm,
    reason,
    preferredSide = null,
    tif = 'IOC',
    quantityMultiplierPpm = PPM,
    strategicBenefitBps = 0,
  },
) {
  const side = preferredSide ?? (scorePpm >= 0 ? 'buy' : 'sell');
  if (!symbol || !participant.mandate.permittedSides.includes(side)) {
    return neutralDecision(participant, reason);
  }
  const priceTicks = executionPriceTicks(participant, frame, symbol, side);
  const strengthPpm = clamp(Math.abs(scorePpm), 0, PPM);
  if (strengthPpm === 0) return neutralDecision(participant, reason);
  const desiredUnits = Math.max(
    1,
    Math.round(
      participant.mandate.maxOrderUnits *
      strengthPpm / PPM *
      quantityMultiplierPpm / PPM,
    ),
  );
  const capacity = assessStrategyCapacity(state, participant.id, {
    side,
    desiredUnits,
    averageDailyVolume: frame.averageDailyVolume?.[symbol] ?? 100_000,
    availableDepthUnits: Math.max(
      1,
      Math.round((frame.averageDailyVolume?.[symbol] ?? 100_000) * 0.025),
    ),
    capitalScalePpm: state.capitalScalePpm,
    floatShares:
      participant.valuationViews[symbol]?.floatShares ?? null,
    currentPositionUnits: participant.portfolio.holdings[symbol] ?? 0,
  });
  participant.performance.capacitySamples.push(capacity);
  if (participant.performance.capacitySamples.length > MAX_HISTORY) {
    participant.performance.capacitySamples.shift();
  }
  const capacityUnits = Math.max(
    1,
    Math.floor(desiredUnits * capacity.executableFractionPpm / PPM),
  );
  const boundary = assessNewRiskBoundary(
    state,
    participant,
    frame,
    symbol,
    side,
    priceTicks,
  );
  const quantity = Math.max(
    0,
    Math.min(
      capacityUnits,
      boundary.maximumChildUnits,
    ),
  );
  if (quantity <= 0) {
    return neutralDecision(participant, {
      ...reason,
      blockedBy: 'RESOURCE_OR_AUTHORIZATION_BOUNDARY',
      capacity,
      boundaries: boundary,
    });
  }
  const currentPriceTicks = frame.pricesTicks[symbol];
  const expectedMoveTicks = Math.max(
    1,
    Math.round(
      currentPriceTicks *
        Math.min(strengthPpm, 250_000) /
        PPM,
    ),
  );
  const expectedExitTicks =
    side === 'buy'
      ? currentPriceTicks + expectedMoveTicks
      : Math.max(
          1,
          currentPriceTicks - expectedMoveTicks,
        );
  const availableDepthUnits = Math.max(
    1,
    Math.round(
      (frame.averageDailyVolume?.[symbol] ?? 100_000) *
        0.025,
    ),
  );
  const expectedUtility = evaluateProfitSeekingOrder({
    side,
    quantity,
    priceTicks,
    expectedExitTicks,
    bestBidTicks: Math.max(
      1,
      currentPriceTicks - 1,
    ),
    bestAskTicks: currentPriceTicks + 1,
    availableAtBestUnits: availableDepthUnits,
    volatilityTicks: Math.max(
      0,
      Math.ceil(
        currentPriceTicks *
          (frame.realizedVolBps?.[symbol] ?? 0) /
          BPS,
      ),
    ),
    existingPositionUnits:
      participant.portfolio.holdings[symbol] ?? 0,
    capitalCents: Math.max(
      1,
      Math.round(
        portfolioEquity(
          participant,
          frame,
          state.symbols,
        ),
      ),
    ),
    riskAversionBps: clamp(
      Math.round(
        (
          participant.valuationPolicy
            .uncertaintyAversionPpm ?? 500_000
        ) /
          100,
      ),
      0,
      BPS,
    ),
    drawdownBps:
      participant.observedRisk.drawdownBps,
    tif,
    additionalImpactBps:
      capacity.expectedImpactBps,
    strategicBenefitCents: Math.max(
      0,
      Math.round(
        priceTicks *
          quantity *
          clamp(
            Math.round(strategicBenefitBps),
            0,
            BPS,
          ) /
          BPS,
      ),
    ),
  });
  const profitObjective = {
    actorId: participant.id,
    accountingBasis:
      'authoritative_observed_account',
    archetype: participant.archetype,
    recentNetAlphaCents:
      participant.learning.recentNetAlphaCents,
    cumulativeExecutionCostsCents:
      participant.performance.executionCostsCents,
    tradedNotionalCents:
      participant.performance.tradedNotionalCents,
    drawdownBps:
      participant.observedRisk.drawdownBps,
  };
  if (!expectedUtility.shouldTrade) {
    return neutralDecision(participant, {
      ...reason,
      blockedBy:
        'EXPECTED_PAYOFF_BELOW_COST_AND_RISK',
      expectedUtility,
      profitObjective,
      capacity,
      boundaries: boundary,
    });
  }
  const id = `ecology_intent_${String(state.nextIntentSequence)
    .padStart(8, '0')}`;
  state.nextIntentSequence += 1;
  return {
    id,
    actorId: participant.id,
    symbol,
    side,
    quantity,
    priceTicks,
    tif,
    scheduledMs: intentScheduleMs(state),
    reason: {
      ...reason,
      expectedUtility,
      profitObjective,
      capacity,
      boundaries: boundary,
    },
  };
}

function trendDecision(state, participant, frame) {
  const scores = Object.fromEntries(
    state.symbols.map((symbol) => {
      const fast = priceChangePpm(
        state,
        symbol,
        participant.model.fastLookbackFrames,
      );
      const slow = priceChangePpm(
        state,
        symbol,
        participant.model.slowLookbackFrames,
      );
      const vol = frame.realizedVolBps?.[symbol] ?? 250;
      const raw = Math.round(fast * 0.65 + slow * 0.35);
      const valuationGuard =
        participant.valuationViews[symbol]?.valuationUpsidePpm ?? 0;
      return [
        symbol,
        Math.round(
          raw * participant.model.volatilityTargetBps / Math.max(80, vol) +
          valuationGuard * 0.08,
        ),
      ];
    }),
  );
  const symbol = chooseByAbsoluteScore(scores);
  return decisionFromSignal(state, participant, frame, {
    symbol,
    scorePpm: scores[symbol],
    reason: {
      model: 'dual_horizon_momentum',
      inputs: {
        fastReturnPpm: priceChangePpm(
          state,
          symbol,
          participant.model.fastLookbackFrames,
        ),
        slowReturnPpm: priceChangePpm(
          state,
          symbol,
          participant.model.slowLookbackFrames,
        ),
        laggedVolBps: frame.realizedVolBps?.[symbol] ?? null,
        valuationRiskGuardPpm:
          participant.valuationViews[symbol]?.valuationUpsidePpm ?? null,
        valuationObservationPublishedMs:
          participant.valuationViews[symbol]?.observationPublishedMs ?? null,
      },
      implementation: 'long_cash_without_implicit_short',
    },
  });
}

function valueDecision(state, participant, frame) {
  const scores = Object.fromEntries(
    state.symbols.map((symbol) => {
      const view = participant.valuationViews[symbol];
      return [
        symbol,
        view?.status === 'VALUED_FROM_ENTERPRISE_FACTS'
          ? view.valuationUpsidePpm
          : 0,
      ];
    }),
  );
  const symbol = chooseByAbsoluteScore(scores);
  const view = participant.valuationViews[symbol];
  return decisionFromSignal(state, participant, frame, {
    symbol,
    scorePpm: scores[symbol],
    reason: {
      model: 'enterprise_per_share_value_distribution',
      inputs: {
        valuationContractVersion:
          INSTITUTIONAL_VALUATION_INPUT_VERSION,
        enterpriseFactPublishedMs:
          view?.observationPublishedMs ?? null,
        perShareValueDistributionTicks: view
          ? {
              low: view.lowTicks,
              central: view.centralTicks,
              high: view.highTicks,
              actionable: view.actionableValueTicks,
            }
          : null,
        methodWeightsPpm: view?.methodWeightsPpm ?? null,
        dynamicMultiplesMilli:
          view?.dynamicMultiplesMilli ?? null,
        riskFreeRateBps: view?.riskFreeRateBps ?? null,
        issuerCreditSpreadBps:
          view?.issuerCreditSpreadBps ?? null,
        longTermGrowthPpm: view?.longTermGrowthPpm ?? null,
        capitalizationRateBps:
          view?.capitalizationRateBps ?? null,
        debtPressurePpm: view?.debtPressurePpm ?? null,
        dilutionPpm: view?.dilutionPpm ?? null,
        sourceEvidenceIds: view?.sourceEvidenceIds ?? null,
        marketPriceTicks: frame.pricesTicks[symbol],
        derivedMarketMetrics:
          view?.derivedMarketMetrics ?? null,
      },
      implementation:
        'enterprise_fact_per_share_value_to_target_weight_gap_not_direct_price_change',
    },
  });
}

function pairRatios(state, first, second) {
  const firstHistory = state.history[first];
  const secondHistory = state.history[second];
  const length = Math.min(firstHistory.length, secondHistory.length);
  const ratios = [];
  for (let index = Math.max(0, length - 20); index < length; index += 1) {
    ratios.push(
      firstHistory[index].priceTicks * PPM /
      Math.max(1, secondHistory[index].priceTicks),
    );
  }
  return ratios;
}

function statArbDecision(state, participant, frame) {
  const [first, second] = participant.model.pair;
  const ratios = pairRatios(state, first, second);
  const currentRatio = ratios.at(-1) ?? PPM;
  const mean = average(ratios);
  const variance = average(ratios.map((value) => (value - mean) ** 2));
  const standardDeviation = Math.max(1, Math.sqrt(variance));
  const zMilli = Math.round((currentRatio - mean) * 1_000 / standardDeviation);
  const expensive = zMilli >= 0 ? first : second;
  const cheap = zMilli >= 0 ? second : first;
  const expensiveUnits = participant.portfolio.holdings[expensive] ?? 0;
  const preferredSide = expensiveUnits > 0 && Math.abs(zMilli) >= 600
    ? 'sell'
    : 'buy';
  const symbol = preferredSide === 'sell' ? expensive : cheap;
  const firstValue = participant.valuationViews[first]?.centralTicks ?? null;
  const secondValue = participant.valuationViews[second]?.centralTicks ?? null;
  const enterpriseDivergencePpm =
    firstValue && secondValue
      ? Math.abs(
          safeRatioPpm(
            firstValue * frame.pricesTicks[second] -
              secondValue * frame.pricesTicks[first],
            Math.max(
              1,
              secondValue * frame.pricesTicks[first],
            ),
          ),
        )
      : participant.model.structuralBreakPpm;
  const structuralConfidencePpm = clamp(
    PPM - enterpriseDivergencePpm,
    120_000,
    PPM,
  );
  const scorePpm = clamp(Math.abs(zMilli) * 900, 0, PPM) *
    (preferredSide === 'buy' ? 1 : -1);
  return decisionFromSignal(state, participant, frame, {
    symbol,
    scorePpm,
    preferredSide,
    reason: {
      model: 'pair_spread_zscore',
      inputs: {
        pair: [first, second],
        spreadZMilli: zMilli,
        formationObservations: ratios.length,
        enterpriseDivergencePpm,
      },
      boundary: participant.model.implementationBoundary,
      structuralBreakRiskPpm: enterpriseDivergencePpm,
    },
    quantityMultiplierPpm: structuralConfidencePpm,
  });
}

function portfolioEquity(participant, frame, symbols) {
  return participant.portfolio.cashCents + symbols.reduce(
    (sum, symbol) =>
      sum +
      (participant.portfolio.holdings[symbol] ?? 0) *
      frame.pricesTicks[symbol],
    0,
  );
}

function volatilityRiskDecision(state, participant, frame) {
  const inverseVol = Object.fromEntries(
    state.symbols.map((symbol) => {
      const valuationQualityPpm = clamp(
        PPM +
          (participant.valuationViews[symbol]?.valuationUpsidePpm ?? 0) / 5,
        600_000,
        1_300_000,
      );
      return [
        symbol,
        PPM / Math.max(1, frame.realizedVolBps?.[symbol] ?? 300) *
          valuationQualityPpm / PPM,
      ];
    }),
  );
  const totalInverseVol = Object.values(inverseVol)
    .reduce((sum, value) => sum + value, 0);
  const equity = portfolioEquity(participant, frame, state.symbols);
  const gaps = Object.fromEntries(
    state.symbols.map((symbol) => {
      const targetValue =
        equity * inverseVol[symbol] / Math.max(1, totalInverseVol);
      const currentValue =
        (participant.portfolio.holdings[symbol] ?? 0) *
        frame.pricesTicks[symbol];
      return [
        symbol,
        safeRatioPpm(targetValue - currentValue, Math.max(1, equity)),
      ];
    }),
  );
  const symbol = chooseByAbsoluteScore(gaps);
  return decisionFromSignal(state, participant, frame, {
    symbol,
    scorePpm: gaps[symbol],
    reason: {
      model: 'equal_risk_contribution',
      inputs: {
        laggedVolatilityBps: cloneJson(frame.realizedVolBps ?? {}),
        targetWeightPpm: Math.round(
          inverseVol[symbol] * PPM / Math.max(1, totalInverseVol),
        ),
        currentEquityCents: Math.round(equity),
        enterpriseValueQualityPpm:
          participant.valuationViews[symbol]?.valuationUpsidePpm ?? null,
      },
      boundary: participant.model.implementationBoundary,
    },
  });
}

function passiveDecision(state, participant, frame) {
  const incoming = cloneJson(frame.indexWeightsPpm ?? {});
  if (Object.keys(participant.model.lastWeightsPpm).length === 0) {
    participant.model.lastWeightsPpm = incoming;
    return neutralDecision(participant, {
      model: 'tracking_error_rebalance',
      inputs: { indexWeightsPpm: incoming, changed: false },
      boundary: participant.model.primaryMarketBoundary,
    });
  }
  const changes = Object.fromEntries(
    state.symbols.map((symbol) => [
      symbol,
      (incoming[symbol] ?? 0) -
      (participant.model.lastWeightsPpm[symbol] ?? 0),
    ]),
  );
  const symbol = chooseByAbsoluteScore(changes);
  const scorePpm = changes[symbol] ?? 0;
  participant.model.pendingWeightsPpm = incoming;
  participant.model.lastWeightsPpm = incoming;
  return decisionFromSignal(state, participant, frame, {
    symbol,
    scorePpm,
    reason: {
      model: 'tracking_error_rebalance',
      inputs: {
        indexWeightsPpm: incoming,
        targetWeightChangePpm: scorePpm,
      },
      boundary: participant.model.primaryMarketBoundary,
    },
    quantityMultiplierPpm: 750_000,
  });
}

function eventDecision(state, participant, frame) {
  const events = Object.values(participant.model.events)
    .filter((event) => event.expiryMs > frame.virtualMs)
    .sort((left, right) =>
      left.expiryMs - right.expiryMs ||
      left.id.localeCompare(right.id),
    );
  if (!events.length) {
    return neutralDecision(participant, {
      model: 'probability_weighted_event',
      inputs: { activeEventCount: 0 },
      boundary: participant.model.hedgingBoundary,
    });
  }
  const event = events[0];
  const market = frame.pricesTicks[event.symbol];
  const enterpriseFailureView =
    participant.valuationViews[event.symbol]?.lowTicks ?? null;
  const failure = enterpriseFailureView ?? Math.max(
    1,
    Math.round(market * (PPM - participant.model.failureHaircutPpm) / PPM),
  );
  const probability = clamp(event.successProbabilityPpm ?? 500_000, 0, PPM);
  const expected =
    (event.offerPriceTicks * probability +
      failure * (PPM - probability)) / PPM;
  const scorePpm = safeRatioPpm(expected - market, market);
  return decisionFromSignal(state, participant, frame, {
    symbol: event.symbol,
    scorePpm,
    reason: {
      model: 'probability_weighted_event',
      inputs: {
        eventId: event.id,
        offerPriceTicks: event.offerPriceTicks,
        estimatedSuccessProbabilityPpm: probability,
        failurePriceTicks: failure,
        failureValueSource: enterpriseFailureView
          ? 'enterprise_fact_value_low_bound'
          : 'fallback_market_haircut',
        expiryMs: event.expiryMs,
      },
      boundary: participant.model.hedgingBoundary,
    },
  });
}

function researchEntries(organization) {
  return Object.values(organization.evidenceLedger);
}

function updateDiscretionaryResearch(participant, nowMs, symbols) {
  const organization = participant.organization;
  if (nowMs < organization.nextResearchMs) return;
  const entries = researchEntries(organization)
    .filter((entry) => entry.availableMs <= nowMs)
    .sort((left, right) =>
      right.strengthPpm - left.strengthPpm ||
      left.publishedMs - right.publishedMs ||
      left.id.localeCompare(right.id),
    );
  const attended = entries.slice(0, organization.attentionSlots * symbols.length);
  for (const symbol of symbols) {
    const relevant = attended.filter((entry) => entry.symbol === symbol);
    const facts = relevant.filter((entry) => entry.layer === 'fact');
    const narratives = relevant.filter((entry) => entry.layer === 'narrative');
    const factScorePpm = clamp(
      facts.reduce(
        (sum, entry) => sum + entry.direction * entry.strengthPpm,
        0,
      ),
      -PPM,
      PPM,
    );
    const narrativeScorePpm = clamp(
      narratives.reduce(
        (sum, entry) => sum + entry.direction * entry.strengthPpm,
        0,
      ),
      -PPM,
      PPM,
    );
    organization.hypotheses[symbol] = {
      factScorePpm,
      narrativeScorePpm,
      combinedScorePpm: Math.round(
        factScorePpm * FACT_WEIGHT_PPM / PPM +
        narrativeScorePpm * NARRATIVE_WEIGHT_PPM / PPM,
      ),
      factCount: facts.length,
      narrativeCount: narratives.length,
      falsifiers: relevant
        .filter((entry) => entry.direction !== sign(factScorePpm))
        .map((entry) => entry.id),
      updatedMs: nowMs,
    };
  }
  const candidate = chooseMax(
    symbols,
    (symbol) => Math.abs(organization.hypotheses[symbol].factScorePpm),
  );
  const hypothesis = organization.hypotheses[candidate];
  const factSufficient =
    hypothesis.factCount >= 2 &&
    Math.abs(hypothesis.factScorePpm) >= 300_000;
  const votes = organization.committee.members.map((member) => {
    let vote = 'defer';
    if (factSufficient) {
      if (
        member.id === 'risk_officer' &&
        hypothesis.falsifiers.length > hypothesis.factCount
      ) {
        vote = 'reject';
      } else {
        vote = 'authorize';
      }
    } else if (
      hypothesis.factCount > 0 &&
      sign(hypothesis.factScorePpm) !== sign(hypothesis.narrativeScorePpm)
    ) {
      vote = 'reject';
    }
    return {
      memberId: member.id,
      weightPpm: member.voteWeightPpm,
      vote,
    };
  });
  const authorizedWeight = votes
    .filter((vote) => vote.vote === 'authorize')
    .reduce((sum, vote) => sum + vote.weightPpm, 0);
  const rejectedWeight = votes
    .filter((vote) => vote.vote === 'reject')
    .reduce((sum, vote) => sum + vote.weightPpm, 0);
  const decision = authorizedWeight >= organization.committee.quorumPpm
    ? 'authorize'
    : rejectedWeight >= organization.committee.quorumPpm
      ? 'reject'
      : 'defer';
  organization.committee.lastVotes = votes;
  organization.committee.lastDecision = decision;
  organization.committee.lastReviewMs = nowMs;
  if (decision === 'authorize') {
    participant.authorization.remainingCents = Math.max(
      participant.authorization.remainingCents,
      Math.round(participant.authorization.approvedCents * 0.45),
    );
  }
  organization.nextResearchMs += organization.researchCadenceMs;
  while (organization.nextResearchMs <= nowMs) {
    organization.nextResearchMs += organization.researchCadenceMs;
  }
}

function discretionaryDecision(state, participant, frame) {
  updateDiscretionaryResearch(participant, frame.virtualMs, state.symbols);
  const drawdownOverride =
    participant.observedRisk.drawdownBps >
    participant.organization.clientDuty.maxDrawdownBps;
  const redemptionOverride =
    participant.observedRisk.redemptionPressurePpm >= 450_000;
  if (drawdownOverride || redemptionOverride) {
    const sellable = state.symbols.filter(
      (symbol) => (participant.portfolio.holdings[symbol] ?? 0) > 0,
    );
    if (sellable.length) {
      const symbol = chooseMax(
        sellable,
        (candidate) =>
          participant.portfolio.holdings[candidate] *
          frame.pricesTicks[candidate],
      );
      const pressurePpm = clamp(
        Math.max(
          safeRatioPpm(
            participant.observedRisk.drawdownBps,
            Math.max(
              1,
              participant.organization.clientDuty.maxDrawdownBps,
            ),
          ),
          participant.observedRisk.redemptionPressurePpm,
        ),
        1,
        PPM,
      );
      const clientDutyAvoidedLossBps = clamp(
        Math.round(
          Math.max(
            0,
            participant.observedRisk.drawdownBps -
              participant.organization.clientDuty
                .maxDrawdownBps,
          ) +
            participant.observedRisk
              .redemptionPressurePpm /
              1_000 +
            participant.observedRisk.fundingStressBps,
        ),
        0,
        2_500,
      );
      return decisionFromSignal(state, participant, frame, {
        symbol,
        scorePpm: -pressurePpm,
        preferredSide: 'sell',
        strategicBenefitBps:
          clientDutyAvoidedLossBps,
        reason: {
          model: 'fact_weighted_committee_case',
          riskOverride: 'CLIENT_DUTY_DE_RISK',
          inputs: {
            drawdownBps: participant.observedRisk.drawdownBps,
            maxDrawdownBps:
              participant.organization.clientDuty.maxDrawdownBps,
            redemptionPressurePpm:
              participant.observedRisk.redemptionPressurePpm,
            clientDutyAvoidedLossBps,
          },
          factWeightPpm: FACT_WEIGHT_PPM,
          narrativeWeightPpm: NARRATIVE_WEIGHT_PPM,
        },
      });
    }
  }
  const scores = Object.fromEntries(
    state.symbols.map((symbol) => [
      symbol,
      Math.round(
        participant.organization.hypotheses[symbol].combinedScorePpm * 0.7 +
        (participant.valuationViews[symbol]?.valuationUpsidePpm ?? 0) * 0.3,
      ),
    ]),
  );
  const symbol = chooseByAbsoluteScore(scores);
  const reason = {
    model: 'fact_weighted_committee_case',
    inputs: {
      hypothesis: cloneJson(participant.organization.hypotheses[symbol]),
      committeeDecision:
        participant.organization.committee.lastDecision,
      authorizationRemainingCents:
        participant.authorization.remainingCents,
      enterpriseValuationView:
        cloneJson(participant.valuationViews[symbol] ?? null),
    },
    factWeightPpm: FACT_WEIGHT_PPM,
    narrativeWeightPpm: NARRATIVE_WEIGHT_PPM,
  };
  if (participant.organization.committee.lastDecision !== 'authorize') {
    return neutralDecision(participant, {
      ...reason,
      blockedBy: 'COMMITTEE_NOT_AUTHORIZED',
    });
  }
  return decisionFromSignal(state, participant, frame, {
    symbol,
    scorePpm: scores[symbol],
    reason,
    quantityMultiplierPpm:
      PPM - participant.organization.positionInertiaPpm,
  });
}

function brokerDecision(state, participant) {
  const parents = Object.values(state.parentOrders)
    .filter((parent) =>
      parent.actorId === participant.id &&
      parent.remainingQty > 0 &&
      parent.status === 'active',
    )
    .sort((left, right) =>
      left.endMs - right.endMs ||
      left.id.localeCompare(right.id),
    );
  return neutralDecision(participant, {
    model: 'parent_order_schedule',
    inputs: {
      activeParentCount: parents.length,
      nextParentOrderId: parents[0]?.id ?? null,
    },
    investmentViewAllowed: false,
  });
}

function strategicDecision(participant) {
  return neutralDecision(participant, {
    model: 'network_intervention_options',
    inputs: {
      requiresExplicitIntent: true,
      allowedTargets: participant.model.allowedTargets,
    },
    noAutomaticMoralPenalty: true,
  });
}

function institutionDecision(state, participant, frame) {
  switch (participant.archetype) {
    case 'quant_trend':
      return trendDecision(state, participant, frame);
    case 'quant_value':
      return valueDecision(state, participant, frame);
    case 'quant_stat_arb':
      return statArbDecision(state, participant, frame);
    case 'quant_volatility_risk_parity':
      return volatilityRiskDecision(state, participant, frame);
    case 'passive_index':
      return passiveDecision(state, participant, frame);
    case 'event_driven':
      return eventDecision(state, participant, frame);
    case 'discretionary_industry':
      return discretionaryDecision(state, participant, frame);
    case 'broker_execution':
      return brokerDecision(state, participant, frame);
    case 'strategic_capital':
      return strategicDecision(participant);
    default:
      throw new Error(`unknown institutional archetype: ${participant.archetype}`);
  }
}

function retailAttentionScores(state) {
  return Object.fromEntries(
    state.symbols.map((symbol) => [
      symbol,
      clamp(
        Math.abs(priceChangePpm(state, symbol, 2)) * 5,
        0,
        PPM,
      ),
    ]),
  );
}

function retailDecision(state, participant, frame) {
  if (participant.population.activeHouseholds <= 0) {
    return neutralDecision(participant, {
      model: participant.decisionPipeline,
      blockedBy: 'NO_ACTIVE_HOUSEHOLDS',
    });
  }
  if (nextRandomPpm(state) >= participant.behavior.arrivalRatePpm) {
    return neutralDecision(participant, {
      model: participant.decisionPipeline,
      inputs: { arrived: false },
    });
  }
  const attention = retailAttentionScores(state);
  participant.attention = attention;
  let symbol = chooseMax(state.symbols, (candidate) => attention[candidate]);
  let side = 'buy';
  let scorePpm = Math.max(20_000, attention[symbol]);
  const current = frame.pricesTicks[symbol];
  let valuationUpsidePpm =
    participant.valuationViews[symbol]?.valuationUpsidePpm ?? 0;
  const reference =
    participant.portfolio.costBasisTicks[symbol] ||
    state.initialPricesTicks[symbol];

  if (participant.archetype === 'disposition_limit_sellers') {
    const winners = state.symbols.filter((candidate) =>
      (participant.portfolio.holdings[candidate] ?? 0) > 0 &&
      frame.pricesTicks[candidate] >
        (participant.portfolio.costBasisTicks[candidate] ||
          state.initialPricesTicks[candidate]),
    );
    if (winners.length) {
      symbol = chooseMax(
        winners,
        (candidate) =>
          frame.pricesTicks[candidate] -
          (participant.portfolio.costBasisTicks[candidate] ||
            state.initialPricesTicks[candidate]) -
          (
            participant.valuationViews[candidate]?.valuationUpsidePpm ?? 0
          ) / 1_000,
      );
      side = 'sell';
      scorePpm = -participant.behavior.dispositionPpm;
      valuationUpsidePpm =
        participant.valuationViews[symbol]?.valuationUpsidePpm ?? 0;
    }
  } else if (participant.archetype === 'household_liquidity_need') {
    const sellable = state.symbols.filter(
      (candidate) => (participant.portfolio.holdings[candidate] ?? 0) > 0,
    );
    if (sellable.length) {
      symbol = chooseMax(
        sellable,
        (candidate) => participant.portfolio.holdings[candidate],
      );
      side = 'sell';
      scorePpm = -Math.max(
        participant.behavior.liquidityNeedPpm,
        safeRatioPpm(
          participant.obligations.scheduledLiquidityNeedCents,
          Math.max(1, participant.portfolio.cashCents),
        ),
      );
    }
  } else if (participant.archetype === 'adaptive_mixed_retail') {
    const returnPpm = priceChangePpm(state, symbol, 3);
    const counterCrowding =
      participant.learning.opponentModels.quant_trend?.predationScorePpm ?? 0;
    const learnedPriceScore =
      counterCrowding > 500_000 ? -returnPpm : returnPpm;
    scorePpm = Math.round(
      learnedPriceScore * 0.55 + valuationUpsidePpm * 0.45,
    );
    side = scorePpm >= 0 ? 'buy' : 'sell';
  } else {
    const returnPpm = priceChangePpm(state, symbol, 2);
    scorePpm = clamp(
      Math.abs(returnPpm) +
        participant.behavior.attentionSensitivityPpm / 4 +
        Math.max(0, valuationUpsidePpm) / 4,
      1,
      PPM,
    );
    side = returnPpm + valuationUpsidePpm / 3 >= 0 ? 'buy' : 'sell';
  }

  const priceOffset = Math.max(
    1,
    Math.round(participant.behavior.priceSensitivityPpm / 250_000),
  );
  const priceTicks = side === 'buy'
    ? Math.max(1, current - priceOffset)
    : current + priceOffset;
  const maximum = availableUnits(participant, symbol, side, priceTicks);
  const householdLots = Math.max(
    1,
    Math.ceil(participant.population.activeHouseholds / 20),
  );
  const quantity = Math.min(
    maximum,
    participant.mandate.maxOrderUnits,
    householdLots * participant.behavior.typicalLotUnits,
  );
  if (quantity <= 0) {
    return neutralDecision(participant, {
      model: participant.decisionPipeline,
      blockedBy: 'FINITE_RETAIL_RESOURCE_BOUNDARY',
    });
  }
  const tif =
    nextRandomPpm(state) <
    participant.behavior.limitPreferencePpm
      ? 'GTC'
      : 'IOC';
  const expectedMoveTicks = Math.max(
    1,
    Math.round(
      current *
        Math.min(Math.abs(scorePpm), 250_000) /
        PPM,
    ),
  );
  const expectedExitTicks =
    side === 'buy'
      ? current + expectedMoveTicks
      : Math.max(1, current - expectedMoveTicks);
  const availableDepthUnits = Math.max(
    1,
    Math.round(
      (frame.averageDailyVolume?.[symbol] ?? 100_000) *
        0.025,
    ),
  );
  const strategicBenefitCents =
    participant.archetype ===
    'household_liquidity_need'
      ? Math.min(
          priceTicks * quantity,
          Math.max(
            participant.obligations
              .scheduledLiquidityNeedCents,
            Math.round(
              priceTicks *
                quantity *
                participant.behavior
                  .liquidityNeedPpm /
                PPM,
            ),
          ),
        )
      : 0;
  const expectedUtility = evaluateProfitSeekingOrder({
    side,
    quantity,
    priceTicks,
    expectedExitTicks,
    bestBidTicks: Math.max(1, current - 1),
    bestAskTicks: current + 1,
    availableAtBestUnits: availableDepthUnits,
    volatilityTicks: Math.max(
      0,
      Math.ceil(
        current *
          (frame.realizedVolBps?.[symbol] ?? 0) /
          BPS,
      ),
    ),
    existingPositionUnits:
      participant.portfolio.holdings[symbol] ?? 0,
    capitalCents: Math.max(
      1,
      Math.round(
        portfolioEquity(
          participant,
          frame,
          state.symbols,
        ),
      ),
    ),
    riskAversionBps: clamp(
      Math.round(
        (
          PPM -
          participant.learning.aggressivenessPpm
        ) /
          100,
      ),
      1_000,
      9_000,
    ),
    drawdownBps: 0,
    tif,
    strategicBenefitCents,
  });
  const profitObjective = {
    actorId: participant.id,
    accountingBasis:
      'authoritative_observed_account',
    archetype: participant.archetype,
    recentNetAlphaCents:
      participant.learning.recentNetAlphaCents,
    cumulativeExecutionCostsCents:
      participant.performance.executionCostsCents,
    tradedNotionalCents:
      participant.performance.tradedNotionalCents,
    drawdownBps: 0,
  };
  if (!expectedUtility.shouldTrade) {
    return neutralDecision(participant, {
      model: participant.decisionPipeline,
      blockedBy:
        'EXPECTED_PAYOFF_BELOW_COST_AND_RISK',
      expectedUtility,
      profitObjective,
      inputs: {
        attentionPpm: attention[symbol],
        referencePriceTicks: reference,
        priceTicks: current,
        activeHouseholds:
          participant.population.activeHouseholds,
      },
    });
  }
  const id = `ecology_intent_${String(state.nextIntentSequence)
    .padStart(8, '0')}`;
  state.nextIntentSequence += 1;
  return {
    id,
    actorId: participant.id,
    symbol,
    side,
    quantity,
    priceTicks,
    tif,
    scheduledMs: intentScheduleMs(state),
    reason: {
      model: participant.decisionPipeline,
      inputs: {
        attentionPpm: attention[symbol],
        referencePriceTicks: reference,
        priceTicks: current,
        activeHouseholds: participant.population.activeHouseholds,
        finiteCashCents: participant.portfolio.cashCents,
        finiteHoldingUnits:
          participant.portfolio.holdings[symbol] ?? 0,
        enterpriseValuationView:
          cloneJson(participant.valuationViews[symbol] ?? null),
      },
      intentionScorePpm: scorePpm,
      expectedUtility,
      profitObjective,
      submissionSelectionSeparateFromFill: true,
    },
  };
}

/**
 * Consumes one already-published, bounded market observation and emits order
 * intents.  No intent is a fill and no returned price is authoritative.
 */
export function advanceInstitutionalEcology(state, frame) {
  if (state?.ruleVersion !== INSTITUTIONAL_ECOLOGY_RULE_VERSION) {
    throw new TypeError('institutional ecology state is required');
  }
  const nextState = cloneJson(state);
  validateFrame(nextState, frame);
  expireIssuedIntentCapabilities(nextState, frame.virtualMs);
  refreshObservedAccounts(
    nextState,
    frame.ownAccounts,
    frame.virtualMs,
  );
  nextState.nowMs = frame.virtualMs;
  appendHistory(nextState, frame);
  ingestValuationObservations(nextState, frame);
  refreshAllValuationViews(nextState, frame);
  ingestPublicEvents(nextState, frame);
  for (const evidence of frame.publicEvidence ?? []) {
    if (evidence.actorId && nextState.participants[evidence.actorId]) {
      ingestInstitutionalEvidence(nextState, evidence.actorId, evidence);
    }
  }
  nextState.latestFrame = cloneJson({
    virtualMs: frame.virtualMs,
    pricesTicks: frame.pricesTicks,
    realizedVolBps: frame.realizedVolBps ?? {},
    averageDailyVolume: frame.averageDailyVolume ?? {},
    indexWeightsPpm: frame.indexWeightsPpm ?? {},
    valuationObservationPublishedMs: Object.fromEntries(
      nextState.symbols.map((symbol) => [
        symbol,
        nextState.enterpriseValuationFacts[symbol].publishedMs,
      ]),
    ),
  });
  const decisions = nextState.participantOrder.map((actorId) => {
    const participant = nextState.participants[actorId];
    return participant.kind === 'institution'
      ? institutionDecision(nextState, participant, frame)
      : retailDecision(nextState, participant, frame);
  });
  const boundDecisions = decisions.filter((decision) =>
    decision.quantity > 0 &&
    nextState.participants[decision.actorId].binding.status ===
      'BOUND_TO_REALTIME_ACCOUNT',
  );
  for (const decision of boundDecisions) {
    registerIntentCapability(
      nextState,
      decision,
      'frame_decision',
    );
  }
  const errors = ecologyInvariantErrors(nextState);
  if (errors.length) {
    throw new Error(
      `institutional ecology transition rejected: ${errors.join(', ')}`,
    );
  }
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, nextState);
  return {
    virtualMs: nextState.nowMs,
    decisions,
    boundDecisions,
  };
}

export function ingestInstitutionalEvidence(state, actorId, evidence) {
  const participant = state?.participants?.[actorId];
  if (!participant?.organization) {
    throw new TypeError('actor has no discretionary research organization');
  }
  if (!evidence || typeof evidence.id !== 'string' || !evidence.id) {
    throw new TypeError('evidence id is required');
  }
  if (
    Object.keys(evidence).some(
      (key) => !RESEARCH_EVIDENCE_FIELDS.has(key),
    )
  ) {
    throw new TypeError('unknown research evidence field');
  }
  if (!state.symbols.includes(evidence.symbol)) {
    throw new TypeError('evidence symbol is outside the mandate');
  }
  if (evidence.layer !== 'fact' && evidence.layer !== 'narrative') {
    throw new TypeError('evidence layer must be fact or narrative');
  }
  if (
    evidence.visibility !== 'public' ||
    typeof evidence.kind !== 'string' ||
    evidence.kind.length === 0 ||
    typeof evidence.sourceAuthority !== 'string' ||
    evidence.sourceAuthority.length === 0 ||
    !Array.isArray(evidence.sourceIds) ||
    evidence.sourceIds.length === 0 ||
    evidence.sourceIds.some(
      (sourceId) =>
        typeof sourceId !== 'string' || sourceId.length === 0,
    ) ||
    new Set(evidence.sourceIds).size !== evidence.sourceIds.length
  ) {
    throw new TypeError(
      'public research source lineage is required',
    );
  }
  if (
    evidence.layer === 'fact' &&
    (
      !Object.hasOwn(
        RESEARCH_FACT_AUTHORITIES_BY_KIND,
        evidence.kind,
      ) ||
      !RESEARCH_FACT_AUTHORITIES_BY_KIND[evidence.kind]
        .includes(evidence.sourceAuthority)
    )
  ) {
    throw new TypeError(
      'research fact kind-authority mismatch',
    );
  }
  if (
    !Number.isSafeInteger(evidence.publishedMs) ||
    evidence.publishedMs > state.nowMs
  ) {
    throw new RangeError('future or non-integer evidence is not observable');
  }
  if (evidence.direction !== 1 && evidence.direction !== -1) {
    throw new TypeError('evidence direction must be -1 or 1');
  }
  if (
    !Number.isSafeInteger(evidence.strengthPpm) ||
    evidence.strengthPpm < 0 ||
    evidence.strengthPpm > PPM
  ) {
    throw new TypeError('evidence strengthPpm must be within [0, 1,000,000]');
  }
  const record = {
    id: evidence.id,
    symbol: evidence.symbol,
    kind: evidence.kind,
    layer: evidence.layer,
    direction: evidence.direction,
    strengthPpm: evidence.strengthPpm,
    publishedMs: evidence.publishedMs,
    availableMs:
      evidence.publishedMs +
      participant.organization.observationDelayMs,
    visibility: evidence.visibility,
    sourceAuthority: evidence.sourceAuthority,
    sourceIds: [...evidence.sourceIds],
  };
  const existing =
    participant.organization.evidenceLedger[record.id];
  if (existing) {
    if (stableStringify(existing) === stableStringify(record)) {
      return cloneJson(existing);
    }
    throw new RangeError(
      `CONFLICTING_RESEARCH_EVIDENCE_ID:${record.id}`,
    );
  }
  participant.organization.evidenceLedger[record.id] = record;
  if (record.layer === 'narrative') {
    participant.organization.narratives[record.id] = cloneJson(record);
  }
  return cloneJson(record);
}

/**
 * Converts internal intents into the existing simulator command contract.
 * Both account and broker must be explicitly bound; unbound strategy prototypes
 * cannot acquire market authority through this adapter.
 */
export function toRealtimeMarketCommands(
  intents,
  {
    ecologyState,
    actorBindings = null,
    unbound = 'throw',
    ownActiveOrders = [],
    includeSchedule = true,
  } = {},
) {
  if (!Array.isArray(intents)) {
    throw new TypeError('intents must be an array');
  }
  if (
    ecologyState?.ruleVersion !==
    INSTITUTIONAL_ECOLOGY_RULE_VERSION
  ) {
    throw new TypeError(
      'canonical institutional ecology state is required',
    );
  }
  const commands = [];
  const scheduledCancels = new Set();
  const capabilityIdsToConsume = [];
  const seenCapabilities = new Set();
  for (const intent of intents) {
    if (!intent || intent.quantity <= 0 || !intent.side || !intent.symbol) {
      continue;
    }
    const participant = ecologyState.participants[intent.actorId];
    const binding = participant?.binding;
    if (
      binding?.status !== 'BOUND_TO_REALTIME_ACCOUNT' ||
      !binding.accountId ||
      !binding.brokerId
    ) {
      if (unbound === 'omit') continue;
      throw new Error(`UNBOUND_NO_MARKET_AUTHORITY:${intent.actorId}`);
    }
    const suppliedBinding = actorBindings?.[intent.actorId];
    if (
      suppliedBinding &&
      (
        suppliedBinding.accountId !== binding.accountId ||
        suppliedBinding.brokerId !== binding.brokerId
      )
    ) {
      throw new Error(
        `ACTOR_BINDING_OVERRIDE_FORBIDDEN:${intent.actorId}`,
      );
    }
    const observedAccountDigest =
      assertCurrentBoundAccountObservation(
        ecologyState,
        participant,
      );
    const capability =
      ecologyState.intentCapabilities?.[intent.id];
    if (!capability) {
      throw new Error(
        `UNISSUED_INTENT_CAPABILITY:${intent.id ?? 'missing'}`,
      );
    }
    if (seenCapabilities.has(capability.id)) {
      throw new Error(
        `DUPLICATE_INTENT_CAPABILITY:${capability.id}`,
      );
    }
    if (capability.status !== 'ISSUED') {
      throw new Error(
        `INTENT_CAPABILITY_NOT_ACTIVE:${capability.id}:` +
          capability.status,
      );
    }
    if (capability.intentDigest !== stableStringify(intent)) {
      throw new Error(
        `INTENT_CAPABILITY_MISMATCH:${capability.id}`,
      );
    }
    if (
      capability.actorId !== participant.id ||
      capability.accountId !== binding.accountId ||
      capability.brokerId !== binding.brokerId ||
      capability.issuedMs !== ecologyState.nowMs ||
      capability.observedFrameMs !==
        participant.portfolio.observedFrameMs ||
      capability.observedCommitSeq !==
        participant.portfolio.observedCommitSeq ||
      capability.observedAccountDigest !== observedAccountDigest
    ) {
      throw new Error(
        `STALE_INTENT_CAPABILITY:${capability.id}`,
      );
    }
    if (!Number.isSafeInteger(intent.scheduledMs)) {
      throw new TypeError('intent scheduledMs must be an integer');
    }
    const selfCrosses = ownActiveOrders
      .filter((order) =>
        order.ownerId === binding.accountId &&
        order.symbol === intent.symbol &&
        order.remainingQty > 0 &&
        (
          order.status === 'accepted' ||
          order.status === 'partially_filled'
        ) &&
        (
          intent.side === 'buy'
            ? order.side === 'sell' &&
              order.priceTicks <= intent.priceTicks
            : order.side === 'buy' &&
              order.priceTicks >= intent.priceTicks
        ),
      )
      .sort((left, right) =>
        left.submittedMs - right.submittedMs ||
        left.id.localeCompare(right.id),
      );
    for (const order of selfCrosses) {
      if (scheduledCancels.has(order.id)) continue;
      const cancel = {
        type: 'cancel_order',
        actorId: binding.accountId,
        brokerId: binding.brokerId,
        orderId: order.id,
      };
      if (includeSchedule) cancel.scheduledMs = intent.scheduledMs;
      commands.push(cancel);
      scheduledCancels.add(order.id);
    }
    const command = {
      type: 'submit_order',
      actorId: binding.accountId,
      brokerId: binding.brokerId,
      symbol: intent.symbol,
      side: intent.side,
      priceTicks: intent.priceTicks,
      quantity: intent.quantity,
      tif: intent.tif ?? 'IOC',
      parentOrderId: intent.parentOrderId ?? null,
    };
    if (includeSchedule) command.scheduledMs = intent.scheduledMs;
    commands.push(command);
    seenCapabilities.add(capability.id);
    capabilityIdsToConsume.push(capability.id);
  }
  for (const capabilityId of capabilityIdsToConsume) {
    const capability =
      ecologyState.intentCapabilities[capabilityId];
    capability.status = 'CONSUMED';
    capability.terminalMs = ecologyState.nowMs;
  }
  trimIntentCapabilityHistory(ecologyState);
  return commands;
}

export function createParentExecutionOrder(state, input) {
  const participant = state?.participants?.[input?.actorId];
  if (participant?.archetype !== 'broker_execution') {
    throw new TypeError('parent order requires the broker execution actor');
  }
  const observedAccountDigest =
    assertCurrentBoundAccountObservation(state, participant);
  if (
    state.latestFrame?.virtualMs !== state.nowMs ||
    !state.latestFrame?.pricesTicks
  ) {
    throw new Error('CURRENT_MARKET_FRAME_REQUIRED_FOR_PARENT_ORDER');
  }
  if (typeof input.clientId !== 'string' || input.clientId.length === 0) {
    throw new TypeError('parent order clientId is required');
  }
  if (!state.symbols.includes(input.symbol)) {
    throw new TypeError('parent order symbol is outside the market');
  }
  if (input.side !== 'buy' && input.side !== 'sell') {
    throw new TypeError('parent order side must be buy or sell');
  }
  if (!isPositiveInteger(input.quantity)) {
    throw new TypeError('parent order quantity must be positive');
  }
  if (
    !Number.isSafeInteger(input.startMs) ||
    !Number.isSafeInteger(input.endMs) ||
    input.startMs < state.nowMs ||
    input.endMs < input.startMs
  ) {
    throw new RangeError('invalid parent execution window');
  }
  if (
    !isPositiveInteger(input.maxParticipationPpm) ||
    input.maxParticipationPpm > participant.mandate.maxParticipationPpm
  ) {
    throw new TypeError('invalid parent participation rate');
  }
  if (
    !Number.isSafeInteger(input.urgencyPpm ?? 500_000) ||
    (input.urgencyPpm ?? 500_000) < 0 ||
    (input.urgencyPpm ?? 500_000) > PPM
  ) {
    throw new TypeError('invalid parent urgency');
  }
  if (!isPositiveInteger(input.limitPriceTicks)) {
    throw new TypeError('parent order limit price must be positive');
  }
  const boundary = assessNewRiskBoundary(
    state,
    participant,
    state.latestFrame,
    input.symbol,
    input.side,
    input.limitPriceTicks,
  );
  if (input.quantity > boundary.maximumExposureUnits) {
    throw new RangeError(
      `PARENT_ORDER_RISK_BOUNDARY:${participant.id}`,
    );
  }
  const id = `ecology_parent_${String(state.nextParentSequence)
    .padStart(8, '0')}`;
  state.nextParentSequence += 1;
  const parent = {
    id,
    actorId: input.actorId,
    clientId: input.clientId,
    symbol: input.symbol,
    side: input.side,
    originalQty: input.quantity,
    remainingQty: input.quantity,
    startMs: input.startMs,
    endMs: input.endMs,
    maxParticipationPpm: input.maxParticipationPpm,
    urgencyPpm: clamp(input.urgencyPpm ?? 500_000, 0, PPM),
    limitPriceTicks: input.limitPriceTicks,
    childIntentIds: [],
    createdObservedFrameMs: participant.portfolio.observedFrameMs,
    createdObservedCommitSeq:
      participant.portfolio.observedCommitSeq,
    createdAccountDigest: observedAccountDigest,
    lastSliceFrameMs: null,
    lastObservedCommitSeq:
      participant.portfolio.observedCommitSeq,
    lastAccountDigest: observedAccountDigest,
    riskBoundaryAtCreation: boundary,
    status: 'active',
  };
  state.parentOrders[id] = parent;
  return cloneJson(parent);
}

export function sliceParentExecution(
  state,
  parentOrderId,
  observation,
) {
  const parent = state?.parentOrders?.[parentOrderId];
  if (!parent) throw new Error('parent order not found');
  if (parent.status !== 'active' || parent.remainingQty <= 0) return [];
  const participant = state.participants[parent.actorId];
  const observedAccountDigest =
    assertCurrentBoundAccountObservation(state, participant);
  if (
    !Number.isSafeInteger(observation?.nowMs) ||
    observation.nowMs !== state.nowMs ||
    observation.nowMs < parent.startMs ||
    observation.nowMs > parent.endMs
  ) {
    throw new RangeError(
      'BROKER_SLICE_REQUIRES_CURRENT_AUTHORIZED_FRAME',
    );
  }
  if (parent.lastSliceFrameMs === state.nowMs) return [];
  if (!isPositiveInteger(observation.observedFrameVolume)) return [];
  if (
    !isPositiveInteger(observation.bestAskTicks) ||
    !isPositiveInteger(observation.bestBidTicks)
  ) {
    throw new TypeError('positive current best bid and ask are required');
  }
  const participationCap = Math.floor(
    observation.observedFrameVolume *
    parent.maxParticipationPpm / PPM,
  );
  if (participationCap <= 0) return [];
  const remainingFrames = Math.max(
    1,
    Math.floor((parent.endMs - observation.nowMs) / ECOLOGY_FRAME_MS) + 1,
  );
  const scheduleNeed = Math.ceil(parent.remainingQty / remainingFrames);
  const urgencyNeed = Math.ceil(
    scheduleNeed * (500_000 + parent.urgencyPpm) / PPM,
  );
  const quantity = Math.min(
    parent.remainingQty,
    participationCap,
    Math.max(scheduleNeed, urgencyNeed),
  );
  const reference = parent.side === 'buy'
    ? observation.bestAskTicks
    : observation.bestBidTicks;
  let priceTicks = reference;
  if (parent.side === 'buy') {
    priceTicks = Math.min(parent.limitPriceTicks, reference);
  } else {
    priceTicks = Math.max(parent.limitPriceTicks, reference);
  }
  if (!isPositiveInteger(priceTicks)) return [];
  const boundary = assessNewRiskBoundary(
    state,
    participant,
    state.latestFrame,
    parent.symbol,
    parent.side,
    priceTicks,
  );
  const boundedQuantity = Math.min(
    quantity,
    boundary.maximumChildUnits,
  );
  if (boundedQuantity <= 0) return [];
  const id = `ecology_intent_${String(state.nextIntentSequence)
    .padStart(8, '0')}`;
  state.nextIntentSequence += 1;
  const child = {
    id,
    actorId: parent.actorId,
    symbol: parent.symbol,
    side: parent.side,
    quantity: boundedQuantity,
    priceTicks,
    tif: 'IOC',
    scheduledMs: observation.nowMs,
    parentOrderId: parent.id,
    reason: {
      model: 'parent_order_schedule',
      scheduleNeed,
      participationCap,
      remainingFrames,
      urgencyPpm: parent.urgencyPpm,
      boundaries: boundary,
    },
  };
  registerIntentCapability(
    state,
    child,
    'broker_parent_child',
  );
  parent.remainingQty -= boundedQuantity;
  parent.childIntentIds.push(id);
  parent.lastSliceFrameMs = state.nowMs;
  parent.lastObservedCommitSeq =
    participant.portfolio.observedCommitSeq;
  parent.lastAccountDigest = observedAccountDigest;
  if (parent.remainingQty === 0) parent.status = 'completed_intents_emitted';
  return [child];
}

export function assessStrategyCapacity(
  state,
  actorId,
  {
    side = 'buy',
    desiredUnits,
    averageDailyVolume,
    availableDepthUnits,
    capitalScalePpm = state?.capitalScalePpm ?? PPM,
    floatShares = null,
    currentPositionUnits = 0,
  },
) {
  const participant = state?.participants?.[actorId];
  if (!participant) throw new Error('unknown ecology actor');
  if (
    !isPositiveInteger(desiredUnits) ||
    !isPositiveInteger(averageDailyVolume) ||
    !isPositiveInteger(availableDepthUnits) ||
    !isPositiveInteger(capitalScalePpm) ||
    !['buy', 'sell'].includes(side) ||
    (
      floatShares !== null &&
      !isPositiveInteger(floatShares)
    ) ||
    !Number.isSafeInteger(currentPositionUnits) ||
    currentPositionUnits < 0
  ) {
    throw new TypeError('capacity inputs must be positive integers');
  }
  const participationPpm = Math.ceil(
    desiredUnits * PPM / averageDailyVolume,
  );
  const depthUsePpm = Math.ceil(
    desiredUnits * PPM / availableDepthUnits,
  );
  const effectiveParticipationPpm = Math.ceil(
    participationPpm * capitalScalePpm / PPM,
  );
  const crowdingPpm = clamp(
    participant.crowding.capitalFollowingPpm +
    participant.crowding.holdingOverlapPpm +
    participant.crowding.synchronizedFlowPpm,
    0,
    3 * PPM,
  );
  const floatUsePpm = floatShares === null
    ? 0
    : Math.ceil(desiredUnits * PPM / floatShares);
  const postTradePositionUnits = side === 'buy'
    ? currentPositionUnits + desiredUnits
    : Math.max(0, currentPositionUnits - desiredUnits);
  const postTradeFloatOwnershipPpm = floatShares === null
    ? 0
    : Math.ceil(
        postTradePositionUnits * PPM / floatShares,
      );
  const exitOverhangPpm =
    floatShares === null || side !== 'sell'
      ? 0
      : Math.ceil(currentPositionUnits * PPM / floatShares);
  const ownershipConcentrationPenaltyPpm = side === 'buy'
    ? Math.max(0, postTradeFloatOwnershipPpm - 20_000)
    : 0;
  const exitOverhangPenaltyPpm = side === 'sell'
    ? Math.floor(exitOverhangPpm / 2)
    : 0;
  const floatCapacityPenaltyPpm =
    floatUsePpm * 2 +
    ownershipConcentrationPenaltyPpm +
    exitOverhangPenaltyPpm;
  const denominator =
    PPM +
    effectiveParticipationPpm * 2 +
    depthUsePpm +
    Math.floor(crowdingPpm / 2) +
    floatCapacityPenaltyPpm;
  const executableFractionPpm = clamp(
    Math.floor(PPM * PPM / Math.max(PPM, denominator)),
    25_000,
    PPM,
  );
  const expectedImpactBps = Math.max(
    1,
    Math.ceil(
      Math.sqrt(Math.max(1, effectiveParticipationPpm) / 1_000) * 4 +
      depthUsePpm / 50_000 +
      crowdingPpm / 200_000 +
      floatUsePpm / 20_000 +
      (
        side === 'buy'
          ? postTradeFloatOwnershipPpm / 50_000
          : exitOverhangPpm / 100_000
      ),
    ),
  );
  const permittedDailyUnits = Math.max(
    1,
    Math.floor(
      averageDailyVolume *
      participant.mandate.maxParticipationPpm / PPM *
      executableFractionPpm / PPM,
    ),
  );
  const exitFrames = Math.max(
    1,
    Math.ceil(desiredUnits / permittedDailyUnits),
  );
  return {
    side,
    desiredUnits,
    participationPpm,
    depthUsePpm,
    effectiveParticipationPpm,
    crowdingPpm,
    floatUsePpm,
    postTradeFloatOwnershipPpm,
    exitOverhangPpm,
    ownershipConcentrationPenaltyPpm,
    exitOverhangPenaltyPpm,
    floatCapacityPenaltyPpm,
    executableFractionPpm,
    expectedImpactBps,
    exitFrames,
    forcedFailure: false,
  };
}

/**
 * Converts settled active performance and liability pressure into a delayed
 * capital-flow request.  The request changes ecology/crowding expectations but
 * does not mint, transfer, or redeem cash; the world must settle it explicitly.
 */
export function updateStrategyCapitalFlow(
  state,
  actorId,
  {
    settledActiveAlphaCents,
    averageDeployedCapitalCents,
    holdingOverlapPpm = 0,
    synchronizedFlowPpm = 0,
    redemptionCorrelationPpm = 0,
    redemptionShockPpm = 0,
  },
) {
  const participant = state?.participants?.[actorId];
  if (participant?.kind !== 'institution') {
    throw new TypeError('institutional actor is required');
  }
  const integerInputs = [
    settledActiveAlphaCents,
    averageDeployedCapitalCents,
    holdingOverlapPpm,
    synchronizedFlowPpm,
    redemptionCorrelationPpm,
    redemptionShockPpm,
  ];
  if (integerInputs.some((value) => !Number.isSafeInteger(value))) {
    throw new TypeError('capital-flow inputs must be integers');
  }
  if (
    averageDeployedCapitalCents <= 0 ||
    [holdingOverlapPpm, synchronizedFlowPpm, redemptionCorrelationPpm,
      redemptionShockPpm].some((value) => value < 0 || value > PPM)
  ) {
    throw new RangeError('capital-flow ratios must be within valid bounds');
  }
  const activeEfficiencyPpm = clamp(
    safeRatioPpm(
      settledActiveAlphaCents,
      averageDeployedCapitalCents,
    ),
    -PPM,
    PPM,
  );
  participant.performance.activeAlphaSamplesCents.push(
    settledActiveAlphaCents,
  );
  if (participant.performance.activeAlphaSamplesCents.length > MAX_HISTORY) {
    participant.performance.activeAlphaSamplesCents.shift();
  }
  const recentAlpha = average(
    participant.performance.activeAlphaSamplesCents.slice(-4),
  );
  const delayedAlphaEfficiencyPpm = clamp(
    safeRatioPpm(recentAlpha, averageDeployedCapitalCents),
    -PPM,
    PPM,
  );
  const stability = participant.liability.clientCapitalStabilityPpm;
  const alphaFlowPpm = Math.round(
    delayedAlphaEfficiencyPpm * (350_000 + stability / 3) / PPM,
  );
  const liabilityOutflowPpm = Math.round(
    redemptionShockPpm *
    (PPM - stability / 2) / PPM,
  );
  const flowRatePpm = clamp(
    alphaFlowPpm - liabilityOutflowPpm,
    -300_000,
    250_000,
  );
  const capitalFlowIntentCents = Math.round(
    participant.mandate.maxGrossCents * flowRatePpm / PPM,
  );

  participant.crowding.holdingOverlapPpm = holdingOverlapPpm;
  participant.crowding.synchronizedFlowPpm = synchronizedFlowPpm;
  participant.crowding.redemptionCorrelationPpm =
    redemptionCorrelationPpm;
  participant.crowding.capitalFollowingPpm = clamp(
    participant.crowding.capitalFollowingPpm +
      Math.max(0, flowRatePpm) -
      Math.max(0, -flowRatePpm) / 2,
    0,
    PPM,
  );
  participant.crowding.publicFootprintPpm = clamp(
    Math.round(
      participant.crowding.publicFootprintPpm * 0.7 +
      (
        participant.crowding.capitalFollowingPpm +
        synchronizedFlowPpm
      ) * 0.15,
    ),
    0,
    PPM,
  );
  participant.liability.redemptionPressurePpm = redemptionShockPpm;

  const projected = assessStrategyCapacity(state, actorId, {
    side: 'sell',
    desiredUnits: participant.mandate.maxOrderUnits,
    averageDailyVolume: Math.max(
      participant.mandate.maxOrderUnits + 1,
      participant.mandate.maxOrderUnits * 30,
    ),
    availableDepthUnits: Math.max(
      1,
      participant.mandate.maxOrderUnits * 4,
    ),
    capitalScalePpm: state.capitalScalePpm,
  });
  return {
    activeEfficiencyPpm,
    delayedAlphaEfficiencyPpm,
    flowRatePpm,
    capitalFlowIntentCents,
    projectedExitFrames: projected.exitFrames,
    projectedImpactBps: projected.expectedImpactBps,
    forcedFailure: false,
    worldIntent: {
      type: capitalFlowIntentCents >= 0
        ? 'institution_subscription_request'
        : 'institution_redemption_request',
      actorId,
      amountCents: Math.abs(capitalFlowIntentCents),
      status: 'REQUIRES_WORLD_SETTLEMENT',
      source: 'settled_active_performance_and_liability_pressure',
    },
  };
}

export function updateStrategyLearning(state, actorId, observation) {
  const participant = state?.participants?.[actorId];
  if (!participant) throw new Error('unknown ecology actor');
  if (
    typeof observation?.opponentArchetype !== 'string' ||
    !Number.isSafeInteger(observation.capturedAlphaCents) ||
    !Number.isSafeInteger(observation.attemptedAlphaCents) ||
    !Number.isSafeInteger(observation.adverseSelectionBps)
  ) {
    throw new TypeError('invalid learning observation');
  }
  const model =
    participant.learning.opponentModels[observation.opponentArchetype] ?? {
      observations: 0,
      predationScorePpm: 0,
      adverseSelectionBps: 0,
    };
  const lossPpm = observation.attemptedAlphaCents === 0
    ? 0
    : clamp(
        safeRatioPpm(
          Math.max(0, -observation.capturedAlphaCents),
          Math.abs(observation.attemptedAlphaCents),
        ),
        0,
        PPM,
      );
  model.observations += 1;
  model.predationScorePpm = clamp(
    Math.round(
      model.predationScorePpm * 0.7 +
      Math.max(lossPpm, observation.adverseSelectionBps * 1_000) * 0.3,
    ),
    0,
    PPM,
  );
  model.adverseSelectionBps = Math.round(
    (
      model.adverseSelectionBps * (model.observations - 1) +
      observation.adverseSelectionBps
    ) / model.observations,
  );
  participant.learning.opponentModels[observation.opponentArchetype] = model;
  const learningStep = Math.max(
    1,
    Math.round(
      participant.learning.learningRatePpm *
      Math.max(lossPpm, 50_000) / PPM,
    ),
  );
  participant.learning.aggressivenessPpm = clamp(
    participant.learning.aggressivenessPpm - learningStep,
    80_000,
    PPM,
  );
  participant.learning.explorationPpm = clamp(
    participant.learning.explorationPpm +
      Math.max(1, Math.floor(learningStep / 2)),
    0,
    650_000,
  );
  participant.learning.observations += 1;
  participant.learning.recentNetAlphaCents =
    observation.capturedAlphaCents;
  return cloneJson(participant.learning);
}

export function advanceRetailLifecycle(
  state,
  actorId,
  {
    bankruptHouseholds = 0,
    requestedEntrants = 0,
    observedCounterSignal = null,
  },
) {
  const participant = state?.participants?.[actorId];
  if (participant?.kind !== 'retail_cohort') {
    throw new TypeError('retail cohort is required');
  }
  if (
    !Number.isSafeInteger(bankruptHouseholds) ||
    bankruptHouseholds < 0 ||
    !Number.isSafeInteger(requestedEntrants) ||
    requestedEntrants < 0
  ) {
    throw new TypeError('household changes must be non-negative integers');
  }
  const exitedHouseholds = Math.min(
    bankruptHouseholds,
    participant.population.activeHouseholds,
  );
  participant.population.activeHouseholds -= exitedHouseholds;
  participant.population.insolventHouseholds += exitedHouseholds;
  participant.population.exitedHouseholds += exitedHouseholds;

  const pendingRequests = Object.values(
    state.pendingRetailEntryRequests ?? {},
  ).filter(
    (request) =>
      request.actorId === actorId &&
      request.status === 'REQUIRES_WORLD_SETTLEMENT',
  );
  const pendingHouseholds = pendingRequests.reduce(
    (sum, request) => sum + request.requestedHouseholds,
    0,
  );
  const pendingCapitalCents = pendingRequests.reduce(
    (sum, request) => sum + request.requestedCapitalCents,
    0,
  );
  const availableReserve = Math.max(
    0,
    participant.population.entrantReserve - pendingHouseholds,
  );
  const availableCapitalCents = Math.max(
    0,
    participant.population.entrantCapitalPoolCents -
      pendingCapitalCents,
  );
  const affordableEntrants = Math.floor(
    availableCapitalCents /
    Math.max(1, participant.population.capitalPerEntrantCents),
  );
  const requestedEntryHouseholds =
    participant.binding.status === 'BOUND_TO_REALTIME_ACCOUNT'
      ? Math.min(
          requestedEntrants,
          availableReserve,
          affordableEntrants,
        )
      : 0;
  let worldIntent = null;
  if (requestedEntryHouseholds > 0) {
    const id = `ecology_retail_entry_${String(
      state.nextRetailEntrySequence,
    ).padStart(8, '0')}`;
    state.nextRetailEntrySequence += 1;
    worldIntent = {
      id,
      type: 'retail_entry_capital_transfer_request',
      actorId,
      accountId: participant.binding.accountId,
      requestedHouseholds: requestedEntryHouseholds,
      requestedCapitalCents:
        requestedEntryHouseholds *
        participant.population.capitalPerEntrantCents,
      createdMs: state.nowMs,
      status: 'REQUIRES_WORLD_SETTLEMENT',
    };
    state.pendingRetailEntryRequests[id] = cloneJson(worldIntent);
  }

  if (observedCounterSignal) {
    participant.learning.explorationPpm = clamp(
      participant.learning.explorationPpm +
        participant.learning.learningRatePpm / 4,
      0,
      700_000,
    );
    participant.learning.lastCounterSignal = observedCounterSignal;
  }
  participant.status =
    participant.population.activeHouseholds > 0 ? 'active' : 'exited';
  return {
    exitedHouseholds,
    enteredHouseholds: 0,
    requestedEntrants: requestedEntryHouseholds,
    activeHouseholds: participant.population.activeHouseholds,
    entrantReserve: participant.population.entrantReserve,
    blockedBy:
      requestedEntrants > 0 &&
      participant.binding.status !== 'BOUND_TO_REALTIME_ACCOUNT'
        ? 'UNBOUND_NO_MARKET_AUTHORITY'
        : null,
    worldIntent: cloneJson(worldIntent),
  };
}

/**
 * Applies entrant capital only after the world ledger commits the transfer and
 * returns the authoritative aggregate retail account.
 */
export function observeRetailEntrySettlement(state, settlement) {
  const request =
    state?.pendingRetailEntryRequests?.[settlement?.requestId];
  if (!request) throw new Error('retail entry request not found');
  if (request.status !== 'REQUIRES_WORLD_SETTLEMENT') {
    return {
      applied: false,
      reason: 'DUPLICATE_OR_TERMINAL_RETAIL_ENTRY_SETTLEMENT',
    };
  }
  const participant = state.participants[request.actorId];
  if (
    participant?.kind !== 'retail_cohort' ||
    participant.binding.status !== 'BOUND_TO_REALTIME_ACCOUNT' ||
    settlement.accountId !== participant.binding.accountId ||
    settlement.brokerId !== participant.binding.brokerId
  ) {
    throw new TypeError('authoritative bound retail account is required');
  }
  if (
    !Number.isSafeInteger(settlement.commitSeq) ||
    settlement.commitSeq <= participant.portfolio.observedCommitSeq
  ) {
    throw new TypeError('new positive retail settlement commit is required');
  }
  if (
    settlement.settledHouseholds !== request.requestedHouseholds ||
    settlement.settledCapitalCents !== request.requestedCapitalCents
  ) {
    throw new RangeError('retail entry settlement does not match request');
  }
  if (
    participant.population.entrantReserve <
      settlement.settledHouseholds ||
    participant.population.entrantCapitalPoolCents <
      settlement.settledCapitalCents
  ) {
    throw new RangeError('retail entrant reserve is insufficient');
  }
  const account = settlement.ownAccountAfter;
  const accountDigest =
    validateBoundAccountObservation(state, participant, account);
  if (account.commitSeq !== settlement.commitSeq) {
    throw new RangeError(
      'retail settlement and account commit must match',
    );
  }
  const holdings = Object.fromEntries(
    state.symbols.map((symbol) => {
      const units = account.holdings?.[symbol] ?? 0;
      if (!Number.isSafeInteger(units) || units < 0) {
        throw new TypeError(
          'authoritative retail holdings must be non-negative integers',
        );
      }
      return [symbol, units];
    }),
  );

  participant.population.activeHouseholds += settlement.settledHouseholds;
  participant.population.entrantReserve -= settlement.settledHouseholds;
  participant.population.entrantCapitalPoolCents -=
    settlement.settledCapitalCents;
  participant.portfolio.cashCents = account.cashCents;
  participant.portfolio.holdings = holdings;
  participant.portfolio.observedCommitSeq = account.commitSeq;
  participant.portfolio.observedAccountDigest = accountDigest;
  participant.portfolio.observedFrameMs = state.nowMs;
  request.status = 'SETTLED_BY_WORLD';
  request.commitSeq = settlement.commitSeq;
  request.settledCapitalCents = settlement.settledCapitalCents;
  request.settledHouseholds = settlement.settledHouseholds;
  request.settledMs = state.nowMs;
  return {
    applied: true,
    actorId: participant.id,
    enteredHouseholds: settlement.settledHouseholds,
    activeHouseholds: participant.population.activeHouseholds,
    entrantReserve: participant.population.entrantReserve,
  };
}

/**
 * Projects separable mechanical, strategic, funding, regulatory, reputation,
 * and relationship costs.  It deliberately does not settle any of them.
 */
export function attemptInstitutionalDisruption(state, intent) {
  const participant = state?.participants?.[intent?.actorId];
  if (participant?.archetype !== 'strategic_capital') {
    throw new TypeError('strategic capital actor is required');
  }
  if (
    !participant.model.allowedTargets.includes(intent.target?.type) ||
    typeof intent.target?.id !== 'string'
  ) {
    return {
      accepted: false,
      reason: 'TARGET_OUTSIDE_AUTHORITY',
    };
  }
  if (
    !isPositiveInteger(intent.requestedCapitalCents) ||
    intent.requestedCapitalCents > participant.authorization.remainingCents
  ) {
    return {
      accepted: false,
      reason: 'AUTHORIZATION_OR_CAPITAL_BOUNDARY',
    };
  }
  const scalePpm = safeRatioPpm(
    intent.requestedCapitalCents,
    participant.mandate.maxGrossCents,
  );
  const evidenceStrengthPpm = clamp(
    intent.evidenceStrengthPpm ?? 0,
    0,
    PPM,
  );
  const visibilityPpm = clamp(
    Math.round(scalePpm * 0.75 + evidenceStrengthPpm * 0.15),
    0,
    PPM,
  );
  const projectedCosts = {
    marketImpactBudgetCents: Math.round(
      intent.requestedCapitalCents *
      (120_000 + scalePpm / 3) / PPM,
    ),
    visibilityPpm,
    regulatoryAttentionDeltaPpm: Math.round(
      visibilityPpm * (intent.tactic.includes('pressure') ? 0.55 : 0.25),
    ),
    reputationDeltaPpm: -Math.round(
      visibilityPpm * (intent.tactic.includes('pressure') ? 0.22 : 0.06),
    ),
    financingSpreadDeltaBps: Math.max(
      1,
      Math.round(visibilityPpm / 22_000 + scalePpm / 35_000),
    ),
    relationshipTrustDeltaPpm: -Math.max(
      1,
      Math.round(visibilityPpm * 0.31),
    ),
    projectedExitFrames: Math.max(1, Math.ceil(scalePpm / 45_000)),
  };
  const record = {
    id: `ecology_disruption_${String(state.disruptionIntents.length + 1)
      .padStart(6, '0')}`,
    actorId: intent.actorId,
    target: cloneJson(intent.target),
    tactic: intent.tactic,
    requestedCapitalCents: intent.requestedCapitalCents,
    intendedDirection: intent.intendedDirection,
    evidenceStrengthPpm,
    projectedCosts,
    createdMs: state.nowMs,
    status: 'REQUIRES_WORLD_SETTLEMENT',
  };
  state.disruptionIntents.push(record);
  return {
    accepted: true,
    projectedCosts,
    scenarioPayoffRangeCents: {
      min: -Math.round(
        intent.requestedCapitalCents * (350_000 + scalePpm / 4) / PPM,
      ),
      max: Math.round(
        intent.requestedCapitalCents * (280_000 + evidenceStrengthPpm / 3) / PPM,
      ),
    },
    worldIntent: cloneJson(record),
  };
}

/**
 * Settlement observer consumes facts emitted by the authoritative simulator.
 * Duplicate commit observations are ignored per actor.
 */
export function observeInstitutionalSettlement(state, settlement) {
  const participant = state?.participants?.[settlement?.actorId];
  if (!participant) throw new Error('unknown ecology actor');
  if (
    participant.binding.status !== 'BOUND_TO_REALTIME_ACCOUNT' ||
    settlement.accountId !== participant.binding.accountId ||
    settlement.brokerId !== participant.binding.brokerId
  ) {
    throw new TypeError('authoritative bound actor account is required');
  }
  if (!Number.isSafeInteger(settlement.commitSeq) ||
      settlement.commitSeq <= 0) {
    throw new TypeError('positive settlement commitSeq is required');
  }
  if (settlement.commitSeq <= participant.performance.lastSettlementCommitSeq) {
    return {
      applied: false,
      reason: 'DUPLICATE_OR_STALE_SETTLEMENT',
    };
  }
  const account = settlement.ownAccountAfter;
  if (
    account?.accountId !== participant.binding.accountId ||
    account?.brokerId !== participant.binding.brokerId
  ) {
    throw new TypeError('authoritative account identity is required');
  }
  const accountDigest =
    validateBoundAccountObservation(state, participant, account);
  if (account.commitSeq > settlement.commitSeq) {
    throw new RangeError(
      'account observation cannot be newer than settlement',
    );
  }
  const authoritativeHoldings = Object.fromEntries(
    state.symbols.map((symbol) => {
      const units = account.holdings?.[symbol] ?? 0;
      if (!Number.isSafeInteger(units) || units < 0) {
        throw new TypeError('authoritative holdings must be non-negative integers');
      }
      return [symbol, units];
    }),
  );
  if (!Array.isArray(settlement.publicTrades)) {
    throw new TypeError('publicTrades must be an array');
  }
  const accountId = participant.binding.accountId;
  const previousSettlementCommitSeq =
    participant.performance.lastSettlementCommitSeq;
  const relevantTrades = [];
  let notional = 0;
  let buyNotional = 0;
  let sellNotional = 0;
  for (const trade of settlement.publicTrades) {
    if (
      !trade ||
      !Number.isSafeInteger(trade.commitSeq) ||
      trade.commitSeq <= 0 ||
      trade.commitSeq > settlement.commitSeq ||
      !state.symbols.includes(trade.symbol) ||
      !isPositiveInteger(trade.priceTicks) ||
      !isPositiveInteger(trade.quantity) ||
      typeof trade.buyerId !== 'string' ||
      trade.buyerId.length === 0 ||
      typeof trade.sellerId !== 'string' ||
      trade.sellerId.length === 0
    ) {
      throw new TypeError('invalid authoritative public trade');
    }
    if (
      trade.commitSeq <= previousSettlementCommitSeq ||
      (
        trade.buyerId !== accountId &&
        trade.sellerId !== accountId
      )
    ) {
      continue;
    }
    const tradeNotional = trade.priceTicks * trade.quantity;
    if (
      !Number.isSafeInteger(tradeNotional) ||
      !Number.isSafeInteger(notional + tradeNotional)
    ) {
      throw new RangeError('settlement notional exceeds safe integer range');
    }
    notional += tradeNotional;
    if (
      trade.buyerId === accountId &&
      trade.sellerId !== accountId
    ) {
      buyNotional += tradeNotional;
    } else if (
      trade.sellerId === accountId &&
      trade.buyerId !== accountId
    ) {
      sellNotional += tradeNotional;
    }
    relevantTrades.push(trade);
  }
  const nextTradedNotionalCents =
    participant.performance.tradedNotionalCents + notional;
  if (!Number.isSafeInteger(nextTradedNotionalCents)) {
    throw new RangeError(
      'cumulative traded notional exceeds safe integer range',
    );
  }
  const nextAuthorizationRemainingCents = clamp(
    participant.authorization.remainingCents -
      buyNotional +
      sellNotional,
    0,
    participant.authorization.approvedCents,
  );
  const observedSettlementRecord = {
    actorId: participant.id,
    commitSeq: settlement.commitSeq,
    relevantTradeCount: relevantTrades.length,
    observedMs: state.nowMs,
  };

  participant.portfolio.cashCents = account.cashCents;
  participant.portfolio.holdings = authoritativeHoldings;
  participant.portfolio.observedCommitSeq = account.commitSeq;
  participant.portfolio.observedAccountDigest = accountDigest;
  participant.portfolio.observedFrameMs = state.nowMs;
  participant.authorization.remainingCents =
    nextAuthorizationRemainingCents;
  participant.performance.tradedNotionalCents =
    nextTradedNotionalCents;
  participant.performance.lastSettlementCommitSeq = settlement.commitSeq;
  state.observedSettlements.push(observedSettlementRecord);
  if (state.observedSettlements.length > MAX_HISTORY * 4) {
    state.observedSettlements.shift();
  }
  return {
    applied: true,
    relevantTradeCount: relevantTrades.length,
    tradedNotionalCents: notional,
    authorizationRemainingCents:
      participant.authorization.remainingCents,
  };
}

function markedValue(holdings, marks) {
  return Object.entries(holdings ?? {}).reduce(
    (sum, [symbol, units]) =>
      sum + units * (marks?.[symbol] ?? 0),
    0,
  );
}

export function evaluateActivePerformance({
  initialCashCents,
  initialHoldings,
  currentCashCents,
  currentHoldings,
  initialMarksTicks,
  currentMarksTicks,
  externalCashflowsCents = 0,
  passiveCorporateActionsCents = 0,
  deployedCapitalObservationsCents = [],
  tradedNotionalCents = 0,
  realizedExecutionCostsCents = 0,
}) {
  const integers = [
    initialCashCents,
    currentCashCents,
    externalCashflowsCents,
    passiveCorporateActionsCents,
    tradedNotionalCents,
    realizedExecutionCostsCents,
    ...deployedCapitalObservationsCents,
  ];
  if (integers.some((value) => !Number.isSafeInteger(value))) {
    throw new TypeError('performance inputs must use integer cents');
  }
  const initialEquityCents =
    initialCashCents + markedValue(initialHoldings, initialMarksTicks);
  const currentEquityCents =
    currentCashCents + markedValue(currentHoldings, currentMarksTicks);
  const totalPnlCents =
    currentEquityCents - initialEquityCents - externalCashflowsCents;
  const passivePnlCents =
    markedValue(initialHoldings, currentMarksTicks) -
    markedValue(initialHoldings, initialMarksTicks) +
    passiveCorporateActionsCents;
  const activePnlCents =
    totalPnlCents - passivePnlCents;
  const averageDeployedCapitalCents = deployedCapitalObservationsCents.length
    ? Math.round(average(deployedCapitalObservationsCents))
    : 0;
  return {
    initialEquityCents,
    currentEquityCents,
    totalPnlCents,
    passivePnlCents,
    externalCashflowsCents,
    passiveCorporateActionsCents,
    activePnlCents,
    averageDeployedCapitalCents,
    tradedNotionalCents,
    realizedExecutionCostsCents,
    totalReturnBps: initialEquityCents === 0
      ? null
      : Math.round(totalPnlCents * BPS / initialEquityCents),
    alphaEfficiencyBps: averageDeployedCapitalCents === 0
      ? activePnlCents === 0 ? 0 : null
      : Math.round(
          activePnlCents * BPS / averageDeployedCapitalCents,
        ),
    denominatorKind: 'average_deployed_capital',
  };
}

export function ecologyInvariantErrors(state) {
  const errors = [];
  if (!state || typeof state !== 'object') return ['INVALID_STATE'];
  if (state.ruleVersion !== INSTITUTIONAL_ECOLOGY_RULE_VERSION) {
    errors.push('RULE_VERSION_MISMATCH');
  }
  if (!Number.isSafeInteger(state.nowMs) || state.nowMs < 0) {
    errors.push('INVALID_NOW_MS');
  }
  if (
    state.timingContract?.quoteFrameMs !== ECOLOGY_FRAME_MS ||
    state.timingContract?.worldDayMs !== ECOLOGY_WORLD_DAY_MS
  ) {
    errors.push('TIMING_CONTRACT_MISMATCH');
  }
  if (
    state.valuationInputContractVersion !==
    INSTITUTIONAL_VALUATION_INPUT_VERSION
  ) {
    errors.push('VALUATION_INPUT_CONTRACT_MISMATCH');
  }
  if (
    state.authorityBoundary?.matching !== 'external_realtime_simulator' ||
    state.authorityBoundary?.cashLedger !== 'external_realtime_simulator' ||
    state.authorityBoundary?.tradedPrice !==
      'external_realtime_order_book_fills'
  ) {
    errors.push('SECOND_MARKET_AUTHORITY_FORBIDDEN');
  }
  const ids = new Set();
  for (const [id, participant] of Object.entries(state.participants ?? {})) {
    if (ids.has(id) || participant.id !== id) {
      errors.push(`PARTICIPANT_ID_MISMATCH:${id}`);
    }
    ids.add(id);
    if (
      !Number.isSafeInteger(participant.portfolio?.cashCents) ||
      participant.portfolio.cashCents < 0
    ) {
      errors.push(`INVALID_CASH:${id}`);
    }
    for (const symbol of state.symbols ?? []) {
      const units = participant.portfolio?.holdings?.[symbol];
      if (!Number.isSafeInteger(units) || units < 0) {
        errors.push(`INVALID_HOLDING:${id}:${symbol}`);
      }
    }
    if (
      !Number.isSafeInteger(participant.mandate?.maxGrossCents) ||
      participant.mandate.maxGrossCents <= 0 ||
      !Number.isSafeInteger(participant.mandate?.maxOrderUnits) ||
      participant.mandate.maxOrderUnits <= 0
    ) {
      errors.push(`INVALID_MANDATE:${id}`);
    }
    const weights = participant.valuationPolicy?.methodWeightsPpm;
    if (
      weights &&
      (
        Object.values(weights).some(
          (value) =>
            !Number.isSafeInteger(value) ||
            value < 0 ||
            value > PPM,
        ) ||
        Object.values(weights).reduce((sum, value) => sum + value, 0) !== PPM
      )
    ) {
      errors.push(`INVALID_VALUATION_WEIGHTS:${id}`);
    }
    if (!participant.valuationPolicy) {
      errors.push(`MISSING_VALUATION_POLICY:${id}`);
    } else {
      for (const key of [
        'forwardWeightPpm',
        'noiseBandPpm',
        'debtPenaltyPpm',
        'crowdingMarginPpm',
        'uncertaintyAversionPpm',
        'evidenceSkepticismPpm',
        'growthPassThroughPpm',
        'rateSensitivityPpm',
      ]) {
        const value = participant.valuationPolicy[key];
        if (
          !Number.isSafeInteger(value) ||
          value < 0 ||
          value > PPM
        ) {
          errors.push(`INVALID_VALUATION_POLICY:${id}:${key}`);
        }
      }
      for (const key of ['horizonMs', 'observationDelayMs']) {
        const value = participant.valuationPolicy[key];
        if (
          !Number.isSafeInteger(value) ||
          value < 0 ||
          (weights && value === 0)
        ) {
          errors.push(`INVALID_VALUATION_POLICY:${id}:${key}`);
        }
      }
      for (const key of [
        'equityRiskPremiumBps',
        'referenceCapitalizationRateBps',
      ]) {
        const value = participant.valuationPolicy[key];
        if (!Number.isSafeInteger(value) || value < 0) {
          errors.push(`INVALID_VALUATION_POLICY:${id}:${key}`);
        }
      }
      for (const [method, multiple] of Object.entries(
        participant.valuationPolicy.multiplesMilli ?? {},
      )) {
        if (!isPositiveInteger(multiple)) {
          errors.push(
            `INVALID_VALUATION_MULTIPLE:${id}:${method}`,
          );
        }
      }
    }
    const binding = participant.binding;
    if (
      !binding ||
      (
        binding.status === 'BOUND_TO_REALTIME_ACCOUNT' &&
        (
          typeof binding.accountId !== 'string' ||
          binding.accountId.length === 0 ||
          typeof binding.brokerId !== 'string' ||
          binding.brokerId.length === 0
        )
      ) ||
      (
        binding.status === 'UNBOUND_NO_MARKET_AUTHORITY' &&
        (binding.accountId !== null || binding.brokerId !== null)
      ) ||
      ![
        'BOUND_TO_REALTIME_ACCOUNT',
        'UNBOUND_NO_MARKET_AUTHORITY',
      ].includes(binding.status)
    ) {
      errors.push(`INVALID_ACTOR_BINDING:${id}`);
    }
    if (
      !Number.isSafeInteger(participant.portfolio?.observedCommitSeq) ||
      participant.portfolio.observedCommitSeq < 0 ||
      (
        participant.portfolio.observedAccountDigest !== null &&
        typeof participant.portfolio.observedAccountDigest !== 'string'
      ) ||
      (
        participant.portfolio.observedAccountDigest === null &&
        participant.portfolio.observedFrameMs !== null
      ) ||
      (
        participant.portfolio.observedAccountDigest !== null &&
        (
          !Number.isSafeInteger(
            participant.portfolio.observedFrameMs,
          ) ||
          participant.portfolio.observedFrameMs < 0 ||
          participant.portfolio.observedFrameMs > state.nowMs
        )
      )
    ) {
      errors.push(`INVALID_OBSERVED_ACCOUNT_STATE:${id}`);
    }
    if (participant.organization) {
      if (
        !Number.isSafeInteger(
          participant.organization.observationDelayMs,
        ) ||
        participant.organization.observationDelayMs < 0
      ) {
        errors.push(`INVALID_RESEARCH_DELAY:${id}`);
      }
      for (const [evidenceId, evidence] of Object.entries(
        participant.organization.evidenceLedger ?? {},
      )) {
        const validFactPair =
          evidence.layer !== 'fact' ||
          (
            Object.hasOwn(
              RESEARCH_FACT_AUTHORITIES_BY_KIND,
              evidence.kind,
            ) &&
            RESEARCH_FACT_AUTHORITIES_BY_KIND[evidence.kind]
              .includes(evidence.sourceAuthority)
          );
        if (
          evidence.id !== evidenceId ||
          evidence.visibility !== 'public' ||
          !Array.isArray(evidence.sourceIds) ||
          evidence.sourceIds.length === 0 ||
          new Set(evidence.sourceIds).size !==
            evidence.sourceIds.length ||
          !Number.isSafeInteger(evidence.publishedMs) ||
          evidence.availableMs !==
            evidence.publishedMs +
              participant.organization.observationDelayMs ||
          !validFactPair
        ) {
          errors.push(`INVALID_RESEARCH_EVIDENCE:${id}:${evidenceId}`);
        }
      }
    }
    if (participant.kind === 'institution') {
      if (
        !Number.isSafeInteger(participant.authorization?.approvedCents) ||
        participant.authorization.approvedCents < 0 ||
        !Number.isSafeInteger(participant.authorization?.remainingCents) ||
        participant.authorization.remainingCents < 0 ||
        participant.authorization.remainingCents >
          participant.authorization.approvedCents ||
        !Number.isSafeInteger(participant.authorization?.expiresMs) ||
        participant.authorization.expiresMs < 0
      ) {
        errors.push(`INVALID_AUTHORIZATION:${id}`);
      }
      for (const key of [
        'tradedNotionalCents',
        'executionCostsCents',
        'lastSettlementCommitSeq',
      ]) {
        if (
          !Number.isSafeInteger(participant.performance?.[key]) ||
          participant.performance[key] < 0
        ) {
          errors.push(`INVALID_PERFORMANCE:${id}:${key}`);
        }
      }
    } else if (participant.kind === 'retail_cohort') {
      for (const key of [
        'activeHouseholds',
        'entrantReserve',
        'insolventHouseholds',
        'exitedHouseholds',
      ]) {
        if (
          !Number.isSafeInteger(participant.population?.[key]) ||
          participant.population[key] < 0
        ) {
          errors.push(`INVALID_RETAIL_POPULATION:${id}:${key}`);
        }
      }
      for (const key of [
        'entrantCapitalPoolCents',
        'capitalPerEntrantCents',
      ]) {
        if (
          !Number.isSafeInteger(participant.population?.[key]) ||
          participant.population[key] < 0
        ) {
          errors.push(`INVALID_RETAIL_CAPITAL:${id}:${key}`);
        }
      }
    } else {
      errors.push(`INVALID_PARTICIPANT_KIND:${id}`);
    }
  }
  const capabilityEntries = Object.entries(
    state.intentCapabilities ?? {},
  );
  if (
    !state.intentCapabilities ||
    typeof state.intentCapabilities !== 'object' ||
    Array.isArray(state.intentCapabilities) ||
    capabilityEntries.length > MAX_INTENT_CAPABILITY_HISTORY
  ) {
    errors.push('INVALID_INTENT_CAPABILITY_LEDGER');
  }
  for (const [capabilityId, capability] of capabilityEntries) {
    const participant = state.participants?.[capability.actorId];
    const terminalStatus = capability.status !== 'ISSUED';
    if (
      capability.id !== capabilityId ||
      !participant ||
      participant.binding.status !== 'BOUND_TO_REALTIME_ACCOUNT' ||
      capability.accountId !== participant.binding.accountId ||
      capability.brokerId !== participant.binding.brokerId ||
      !Number.isSafeInteger(capability.issuedMs) ||
      capability.issuedMs < 0 ||
      capability.issuedMs > state.nowMs ||
      !Number.isSafeInteger(capability.observedFrameMs) ||
      capability.observedFrameMs < 0 ||
      capability.observedFrameMs > capability.issuedMs ||
      !Number.isSafeInteger(capability.observedCommitSeq) ||
      capability.observedCommitSeq < 0 ||
      typeof capability.observedAccountDigest !== 'string' ||
      capability.observedAccountDigest.length === 0 ||
      typeof capability.intentDigest !== 'string' ||
      capability.intentDigest.length === 0 ||
      !['frame_decision', 'broker_parent_child'].includes(
        capability.source,
      ) ||
      !INTENT_CAPABILITY_STATUSES.has(capability.status) ||
      (
        capability.status === 'ISSUED' &&
        (
          capability.terminalMs !== null ||
          capability.issuedMs !== state.nowMs ||
          capability.observedFrameMs !==
            participant.portfolio.observedFrameMs ||
          capability.observedCommitSeq !==
            participant.portfolio.observedCommitSeq ||
          capability.observedAccountDigest !==
            participant.portfolio.observedAccountDigest
        )
      ) ||
      (
        terminalStatus &&
        (
          !Number.isSafeInteger(capability.terminalMs) ||
          capability.terminalMs < capability.issuedMs ||
          capability.terminalMs > state.nowMs
        )
      )
    ) {
      errors.push(`INVALID_INTENT_CAPABILITY:${capabilityId}`);
    }
  }
  const pipelines = Object.values(state.participants ?? {})
    .filter((participant) => participant.kind === 'institution')
    .map((participant) => participant.decisionPipeline);
  if (new Set(pipelines).size !== pipelines.length) {
    errors.push('INSTITUTION_PIPELINES_NOT_DISTINCT');
  }
  for (const [symbol, observation] of Object.entries(
    state.enterpriseValuationFacts ?? {},
  )) {
    for (const error of validateEnterpriseValuationObservation(
      observation,
      symbol,
    )) {
      errors.push(`VALUATION:${symbol}:${error}`);
    }
  }
  for (const symbol of state.symbols ?? []) {
    const history = state.enterpriseValuationHistory?.[symbol];
    if (!Array.isArray(history) || history.length > MAX_HISTORY) {
      errors.push(`INVALID_VALUATION_HISTORY:${symbol}`);
      continue;
    }
    let previousPublishedMs = -1;
    for (const observation of history) {
      for (const error of validateEnterpriseValuationObservation(
        observation,
        symbol,
      )) {
        errors.push(`VALUATION_HISTORY:${symbol}:${error}`);
      }
      if (observation.publishedMs <= previousPublishedMs) {
        errors.push(`NON_MONOTONIC_VALUATION_HISTORY:${symbol}`);
      }
      previousPublishedMs = observation.publishedMs;
    }
    if (
      history.length > 0 &&
      stableStringify(history.at(-1)) !== stableStringify(
        state.enterpriseValuationFacts?.[symbol],
      )
    ) {
      errors.push(`VALUATION_HISTORY_HEAD_MISMATCH:${symbol}`);
    }
  }
  const pendingByActor = {};
  for (const [requestId, request] of Object.entries(
    state.pendingRetailEntryRequests ?? {},
  )) {
    if (
      request.id !== requestId ||
      state.participants?.[request.actorId]?.kind !== 'retail_cohort' ||
      !isPositiveInteger(request.requestedHouseholds) ||
      !isPositiveInteger(request.requestedCapitalCents) ||
      ![
        'REQUIRES_WORLD_SETTLEMENT',
        'SETTLED_BY_WORLD',
      ].includes(request.status)
    ) {
      errors.push(`INVALID_RETAIL_ENTRY_REQUEST:${requestId}`);
      continue;
    }
    if (request.status === 'REQUIRES_WORLD_SETTLEMENT') {
      pendingByActor[request.actorId] =
        (pendingByActor[request.actorId] ?? 0) +
        request.requestedHouseholds;
    }
  }
  for (const [actorId, pendingHouseholds] of Object.entries(
    pendingByActor,
  )) {
    if (
      pendingHouseholds >
      state.participants[actorId].population.entrantReserve
    ) {
      errors.push(`RETAIL_ENTRY_RESERVE_OVERBOOKED:${actorId}`);
    }
  }
  return errors;
}

export function canonicalInstitutionalEcology(state) {
  const errors = ecologyInvariantErrors(state);
  if (errors.length) {
    throw new Error(`invalid institutional ecology: ${errors.join(', ')}`);
  }
  return cloneJson(state);
}
