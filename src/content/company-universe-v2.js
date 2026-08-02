const COMPANY_UNIVERSE_SCHEMA = 'lzy_company_universe_v2';

function product(id, kind, revenueUnit) {
  return { id, kind, revenueUnit };
}

const DEFINITIONS = Object.freeze([
  {
    companyId: 'company_aurora_materials',
    canonicalName: '曙原材料',
    historicalOrigin: '由临江港工业材料联合体改制并分拆形成。',
    ecosystemRole: '先进材料与关键制造投入的稳定上游',
    cityPresence: ['临江港材料园', '滨河研发中心'],
    milestones: [
      ['origin_reform', '完成联合体改制并建立独立质量体系'],
      ['high_purity_line', '投运高纯材料产线并通过长期客户认证'],
    ],
    modelKind: 'advanced_materials_supplier',
    products: [product('high_purity_material', 'advanced_material', 'qualified_batch')],
    revenueDrivers: ['qualified_batch_delivery', 'long_term_supply_contract'],
    costDrivers: ['raw_material_input', 'energy_use', 'quality_control'],
    capacityConstraints: ['qualified_line_hours', 'environmental_capacity'],
    revenueRecognition: '客户验收合格批次后确认交付收入。',
    cashConstraints: ['customer_receivable_days', 'safety_upgrade_commitment'],
    failureStates: ['batch_quality_rejection', 'receivable_delay'],
    recoveryPaths: ['process_requalification', 'contract_term_renegotiation'],
    governanceFocus: 'environment_and_process_safety',
    reservedMatter: 'new_high_purity_line',
    employeeGroups: ['process_engineers', 'line_operators'],
    customerGroups: ['chip_material_buyers', 'equipment_manufacturers'],
  },
  {
    companyId: 'company_qianfeng_resources',
    canonicalName: '乾峰资源',
    historicalOrigin: '从山地矿业合作体发展为关键矿产综合运营商。',
    ecosystemRole: '关键矿产与长期资源保障节点',
    cityPresence: ['乾峰资源调度中心', '临江港矿产仓'],
    milestones: [
      ['reserve_integration', '整合多处矿权并建立统一品位追踪'],
      ['long_term_supply', '与先进制造客户签署可审计长期供货协议'],
    ],
    modelKind: 'critical_resource_operator',
    products: [product('qualified_mineral_lot', 'critical_minerals', 'verified_tonne')],
    revenueDrivers: ['verified_mineral_delivery', 'long_term_offtake'],
    costDrivers: ['mine_development', 'safety_work', 'transport'],
    capacityConstraints: ['permitted_output', 'ore_grade', 'transport_slots'],
    revenueRecognition: '矿批完成品位复核和交割后确认收入。',
    cashConstraints: ['mine_development_commitment', 'site_restoration_reserve'],
    failureStates: ['grade_shortfall', 'safety_suspension'],
    recoveryPaths: ['selective_mining_plan', 'verified_safety_remediation'],
    governanceFocus: 'resource_safety_and_community',
    reservedMatter: 'new_mine_development',
    employeeGroups: ['geology_engineers', 'site_operators'],
    customerGroups: ['chip_material_buyers', 'energy_equipment_buyers'],
  },
  {
    companyId: 'company_frontier_semiconductor',
    canonicalName: '微澜芯源',
    historicalOrigin: '由互连架构科研团队与产业基金共同设立。',
    ecosystemRole: '先进加速芯片设计、验证与认证平台',
    cityPresence: ['微澜芯片设计院', '临江验证实验室'],
    milestones: [
      ['research_spinout', '完成科研成果转化并建立首个设计团队'],
      ['engineering_sample', '首批工程样片完成封装与客户验证'],
      ['qualified_generation', '一代产品取得有限商业认证'],
    ],
    modelKind: 'advanced_semiconductor_platform',
    products: [
      product('accelerator_design', 'accelerator_chip', 'qualified_chip'),
      product('interconnect_chip', 'interconnect_chip', 'qualified_chip'),
    ],
    revenueDrivers: ['qualified_chip_delivery', 'architecture_license'],
    costDrivers: ['research_talent', 'tapeout', 'packaging_validation'],
    capacityConstraints: ['tapeout_slots', 'packaging_yield', 'customer_qualification'],
    revenueRecognition: '合格芯片交付或授权里程碑验收后确认收入。',
    cashConstraints: ['tapeout_prepayment', 'research_cash_runway'],
    failureStates: ['tapeout_failure', 'qualification_delay'],
    recoveryPaths: ['design_revision', 'lower_tier_product_requalification'],
    governanceFocus: 'research_integrity_and_key_person',
    reservedMatter: 'next_generation_tapeout',
    employeeGroups: ['chip_architects', 'verification_engineers'],
    customerGroups: ['compute_operators', 'model_platforms'],
  },
  {
    companyId: 'company_guangmai_interconnect',
    canonicalName: '光脉互联',
    historicalOrigin: '由通信器件厂与数据中心网络团队重组形成。',
    ecosystemRole: '高速光互连与集群网络瓶颈供应商',
    cityPresence: ['光脉器件工厂', '云港互连验证中心'],
    milestones: [
      ['network_reorganization', '完成通信器件与网络团队重组'],
      ['generation_certified', '高速互连新一代产品通过客户认证'],
    ],
    modelKind: 'advanced_network_hardware',
    products: [product('cluster_interconnect', 'interconnect_capacity', 'qualified_port')],
    revenueDrivers: ['qualified_port_delivery', 'maintenance_contract'],
    costDrivers: ['optical_components', 'yield_ramp', 'customer_support'],
    capacityConstraints: ['component_supply', 'yield', 'qualification_windows'],
    revenueRecognition: '设备交付并通过集群联调后确认收入。',
    cashConstraints: ['capacity_ramp_commitment', 'obsolete_inventory_risk'],
    failureStates: ['yield_ramp_delay', 'generation_obsolescence'],
    recoveryPaths: ['process_tuning', 'customer_recertification'],
    governanceFocus: 'customer_concentration_and_generation_transition',
    reservedMatter: 'capacity_ramp_for_single_customer',
    employeeGroups: ['optical_engineers', 'manufacturing_technicians'],
    customerGroups: ['compute_cluster_operators', 'network_integrators'],
  },
  {
    companyId: 'company_anlan_grid',
    canonicalName: '安澜电网',
    historicalOrigin: '由城市输配电与产业园调峰资产整合形成。',
    ecosystemRole: '城市生活与数字基础设施的公共电力节点',
    cityPresence: ['安澜调度中心', '临江变电枢纽'],
    milestones: [
      ['grid_integration', '完成城市与产业园输配资产整合'],
      ['flexibility_program', '启用储能和需求响应调峰计划'],
    ],
    modelKind: 'regulated_grid_operator',
    products: [product('firm_power_capacity', 'power_capacity', 'reserved_capacity_unit')],
    revenueDrivers: ['delivered_power', 'capacity_service'],
    costDrivers: ['network_maintenance', 'capital_program', 'balancing_service'],
    capacityConstraints: ['network_capacity', 'reliability_reserve'],
    revenueRecognition: '按已交付电量与已履行容量服务确认收入。',
    cashConstraints: ['grid_upgrade_commitment', 'reliability_reserve'],
    failureStates: ['local_capacity_shortfall', 'reliability_breach'],
    recoveryPaths: ['staged_grid_upgrade', 'demand_response_activation'],
    governanceFocus: 'public_reliability_and_affordability',
    reservedMatter: 'large_data_center_connection',
    employeeGroups: ['grid_dispatchers', 'maintenance_crews'],
    customerGroups: ['resident_service_areas', 'industrial_and_compute_sites'],
  },
  {
    companyId: 'company_haifeng_new_energy',
    canonicalName: '海沣新能源',
    historicalOrigin: '从沿海风光设备制造基地扩展为全周期设备服务商。',
    ecosystemRole: '可再生能源设备与电力扩容配套方',
    cityPresence: ['海沣装备基地', '港区运维中心'],
    milestones: [
      ['manufacturing_base', '建成首个规模化风光设备基地'],
      ['service_transition', '从一次性交付扩展到长期运维服务'],
    ],
    modelKind: 'renewable_equipment_operator',
    products: [product('renewable_equipment', 'generation_equipment', 'accepted_unit')],
    revenueDrivers: ['accepted_equipment', 'maintenance_service'],
    costDrivers: ['materials', 'factory_utilization', 'warranty_service'],
    capacityConstraints: ['qualified_components', 'installation_crews'],
    revenueRecognition: '设备验收与运维服务期分别确认收入。',
    cashConstraints: ['inventory_commitment', 'warranty_reserve'],
    failureStates: ['inventory_overhang', 'warranty_claim_surge'],
    recoveryPaths: ['production_reduction', 'service_contract_conversion'],
    governanceFocus: 'capacity_discipline_and_warranty',
    reservedMatter: 'new_equipment_factory',
    employeeGroups: ['equipment_engineers', 'field_service_crews'],
    customerGroups: ['grid_operators', 'industrial_energy_projects'],
  },
  {
    companyId: 'company_yuncen_compute',
    canonicalName: '云岑算力',
    historicalOrigin: '由区域数据中心运营商升级为异构算力平台。',
    ecosystemRole: '芯片、互连、电力与模型公司的算力交付枢纽',
    cityPresence: ['云岑一号算力园', '临江运维指挥中心'],
    milestones: [
      ['data_center_origin', '建立首个企业数据中心并形成运维团队'],
      ['heterogeneous_cluster', '上线异构加速集群与容量预留服务'],
      ['capacity_market', '形成可审计的长期和弹性算力合同'],
    ],
    modelKind: 'compute_infrastructure_operator',
    products: [
      product('training_capacity', 'compute_capacity', 'delivered_compute_unit'),
      product('inference_capacity', 'inference_capacity', 'delivered_compute_unit'),
    ],
    revenueDrivers: ['reserved_compute_delivery', 'usage_settlement'],
    costDrivers: ['accelerator_depreciation', 'power_use', 'network_operation'],
    capacityConstraints: ['qualified_accelerators', 'power_reservation', 'cooling_capacity'],
    revenueRecognition: '按可用容量履约与实际使用量分别结算。',
    cashConstraints: ['accelerator_prepayment', 'power_capacity_commitment'],
    failureStates: ['reserved_capacity_shortfall', 'utilization_below_plan'],
    recoveryPaths: ['capacity_reallocation', 'contract_scope_renegotiation'],
    governanceFocus: 'capacity_commitment_and_customer_concentration',
    reservedMatter: 'large_accelerator_purchase',
    employeeGroups: ['site_reliability_engineers', 'capacity_planners'],
    customerGroups: ['model_training_clients', 'enterprise_inference_clients'],
  },
  {
    companyId: 'company_rongyue_data',
    canonicalName: '容岳数据',
    historicalOrigin: '由行业数据治理咨询团队与授权登记平台合并形成。',
    ecosystemRole: '数据权利、质量、脱敏与持续授权中介',
    cityPresence: ['容岳权利登记中心', '滨河数据治理实验室'],
    milestones: [
      ['rights_registry', '建立数据来源与用途授权登记体系'],
      ['continuous_audit', '上线持续撤回、删除与用途审计服务'],
    ],
    modelKind: 'governed_data_service',
    products: [product('data_rights_bundle', 'data_rights_bundle', 'verified_bundle')],
    revenueDrivers: ['governance_project', 'continuous_rights_service'],
    costDrivers: ['rights_review', 'data_quality_work', 'liability_reserve'],
    capacityConstraints: ['qualified_reviewers', 'rights_clearance_time'],
    revenueRecognition: '数据包完成权利与质量验收后按合同阶段确认。',
    cashConstraints: ['liability_reserve', 'manual_rights_review'],
    failureStates: ['rights_scope_mismatch', 'withdrawal_not_honored'],
    recoveryPaths: ['scope_reclearance', 'verified_deletion_and_reissue'],
    governanceFocus: 'data_rights_and_independent_audit',
    reservedMatter: 'new_sensitive_data_category',
    employeeGroups: ['rights_auditors', 'data_quality_engineers'],
    customerGroups: ['model_developers', 'regulated_enterprises'],
  },
  {
    companyId: 'company_tianyan_intelligence',
    canonicalName: '天演智能',
    historicalOrigin: '由推理系统研究团队和产业资本共同创立，经历研究、试点和商业交付阶段。',
    ecosystemRole: '基础模型与智能体平台核心挑战者',
    cityPresence: ['天演研究院', '企业智能体交付中心', '模型安全联测中心'],
    milestones: [
      ['research_origin', '完成首个可复现推理系统研究计划'],
      ['foundation_release', '基础模型通过独立评测并进入受限试点'],
      ['enterprise_delivery', '首批企业智能体完成真实流程交付与续约'],
    ],
    modelKind: 'foundation_model_platform',
    products: [
      product('tianyan_foundation_model', 'foundation_model', 'verified_model_service'),
      product('tianyan_agent_platform', 'agent_platform', 'completed_tool_call'),
      product('tianyan_private_deployment', 'private_deployment', 'accepted_deployment'),
    ],
    revenueDrivers: ['verified_model_usage', 'private_deployment_acceptance', 'enterprise_renewal'],
    costDrivers: ['training_compute', 'inference_compute', 'research_talent', 'safety_assurance'],
    capacityConstraints: ['licensed_data', 'reserved_compute', 'power_capacity', 'qualified_delivery_team'],
    revenueRecognition: 'API 按已核对使用量结算，私有部署按验收里程碑结算。',
    cashConstraints: ['training_compute_precommitment', 'research_cash_runway', 'incident_liability_reserve'],
    failureStates: ['training_run_failure', 'customer_pilot_without_renewal', 'safety_case_rejected'],
    recoveryPaths: ['smaller_verified_training_run', 'deployment_scope_reduction', 'independent_remediation_review'],
    governanceFocus: 'model_safety',
    reservedMatter: 'long_term_compute_contract',
    employeeGroups: ['model_researchers', 'enterprise_delivery_engineers'],
    customerGroups: ['industrial_enterprises', 'cloud_distribution_partners'],
    boardSeatCount: 9,
    extraCommittees: [
      { id: 'related_transactions', mandate: '审查关联交易、数据与算力合同。' },
    ],
    extraReservedMatters: ['model_release_boundary'],
    shareholders: [
      {
        holderId: 'tianyan_founder_partnership',
        holderType: 'founder_partnership',
        economicInterestBps: 3_200,
        votingRightsBps: 5_200,
        controlRole: 'founding_controller',
      },
      {
        holderId: 'company_hengqiao_asset_management',
        holderType: 'company',
        economicInterestBps: 900,
        votingRightsBps: 700,
        controlRole: 'institutional_shareholder',
      },
      {
        holderId: 'company_yuncen_compute',
        holderType: 'company',
        economicInterestBps: 400,
        votingRightsBps: 300,
        controlRole: 'strategic_shareholder',
      },
      {
        holderId: 'tianyan_employee_trust',
        holderType: 'employee_trust',
        economicInterestBps: 700,
        votingRightsBps: 600,
        controlRole: 'employee_interest',
      },
      {
        holderId: 'public_float',
        holderType: 'public_float',
        economicInterestBps: 4_800,
        votingRightsBps: 3_200,
        controlRole: 'minority_shareholders',
      },
    ],
  },
  {
    companyId: 'company_mingjian_security',
    canonicalName: '明鉴安全',
    historicalOrigin: '由关键基础设施应急团队发展为独立安全服务商。',
    ecosystemRole: '模型红队、身份权限与事故响应的独立保障方',
    cityPresence: ['明鉴安全运营中心', '模型红队实验室'],
    milestones: [
      ['incident_response_origin', '建立关键基础设施应急响应团队'],
      ['model_assurance', '形成模型评测、红队与持续监测服务'],
    ],
    modelKind: 'independent_security_assurance',
    products: [product('independent_assurance', 'independent_safety_assurance', 'completed_assurance_case')],
    revenueDrivers: ['security_subscription', 'independent_assurance', 'incident_response'],
    costDrivers: ['specialist_talent', 'test_infrastructure', 'liability_cover'],
    capacityConstraints: ['independent_reviewers', 'conflict_clearance'],
    revenueRecognition: '独立审查完成并交付可复核安全案例后确认。',
    cashConstraints: ['specialist_retention', 'liability_cover'],
    failureStates: ['independence_conflict', 'response_failure'],
    recoveryPaths: ['independent_panel_review', 'verified_response_remediation'],
    governanceFocus: 'independence_and_incident_disclosure',
    reservedMatter: 'assurance_for_related_party',
    employeeGroups: ['red_team_specialists', 'incident_responders'],
    customerGroups: ['model_platforms', 'critical_service_operators'],
  },
  {
    companyId: 'company_qunxing_cloud',
    canonicalName: '群星云服',
    historicalOrigin: '由企业云渠道和多模型集成团队共同搭建。',
    ecosystemRole: '多模型分发、企业客户与云资源的连接平台',
    cityPresence: ['群星企业云中心', '中小企业服务站'],
    milestones: [
      ['enterprise_cloud_origin', '建立中小企业云资源分发网络'],
      ['multi_model_marketplace', '上线多模型选择与退出迁移能力'],
    ],
    modelKind: 'cloud_model_distribution',
    products: [product('multi_model_distribution', 'model_distribution', 'verified_service_call')],
    revenueDrivers: ['cloud_usage_share', 'model_service_share', 'enterprise_subscription'],
    costDrivers: ['cloud_capacity', 'model_supplier_share', 'customer_support'],
    capacityConstraints: ['supplier_capacity', 'integration_team', 'customer_credit'],
    revenueRecognition: '按核对后的资源和模型调用量及订阅周期结算。',
    cashConstraints: ['supplier_minimum_commitment', 'customer_receivable_days'],
    failureStates: ['supplier_lock_in', 'negative_unit_margin'],
    recoveryPaths: ['supplier_diversification', 'customer_tier_restructure'],
    governanceFocus: 'platform_neutrality_and_supplier_conflict',
    reservedMatter: 'exclusive_model_distribution',
    employeeGroups: ['platform_engineers', 'enterprise_customer_success'],
    customerGroups: ['small_enterprises', 'software_application_vendors'],
  },
  {
    companyId: 'company_horizon_software',
    canonicalName: '长镜智软',
    historicalOrigin: '从工业现场工具团队发展为订阅和智能体应用平台。',
    ecosystemRole: '模型能力进入制造流程的工业软件接口层',
    cityPresence: ['长镜产品中心', '临江工业客户实验室'],
    milestones: [
      ['industrial_tool_origin', '发布首套工业现场协同工具'],
      ['subscription_transition', '完成订阅模式和客户续费体系转型'],
      ['agent_pilot', '智能体应用进入受人工复核的工业试点'],
    ],
    modelKind: 'industrial_subscription_software',
    products: [product('industrial_agent_suite', 'industrial_agent_software', 'active_enterprise_seat')],
    revenueDrivers: ['active_seat', 'implementation_milestone', 'customer_renewal'],
    costDrivers: ['product_engineering', 'implementation_team', 'model_service'],
    capacityConstraints: ['implementation_team', 'customer_process_access'],
    revenueRecognition: '订阅按服务期、实施按客户验收里程碑确认。',
    cashConstraints: ['implementation_payroll', 'customer_receivable_days'],
    failureStates: ['customization_overrun', 'renewal_shortfall'],
    recoveryPaths: ['standard_product_scope', 'implementation_partner_delegation'],
    governanceFocus: 'customer_data_and_standard_product',
    reservedMatter: 'large_custom_development',
    employeeGroups: ['product_engineers', 'implementation_consultants'],
    customerGroups: ['manufacturing_enterprises', 'automation_integrators'],
  },
  {
    companyId: 'company_qiming_robotics',
    canonicalName: '启明机器人',
    historicalOrigin: '由柔性控制创业团队和老设备集成商联合成立。',
    ecosystemRole: '工业智能体、机器人与中小工厂的物理应用节点',
    cityPresence: ['启明机器人总装厂', '柔性制造示范车间'],
    milestones: [
      ['founder_prototype', '完成首套柔性机器人原型'],
      ['factory_delivery', '建立中小工厂标准交付与售后体系'],
    ],
    modelKind: 'industrial_robotics_operator',
    products: [product('flexible_robot_cell', 'robotic_workcell', 'accepted_workcell')],
    revenueDrivers: ['accepted_workcell', 'maintenance_service', 'software_renewal'],
    costDrivers: ['components', 'assembly', 'commissioning'],
    capacityConstraints: ['core_components', 'commissioning_engineers'],
    revenueRecognition: '机器人单元完成现场验收后确认设备收入。',
    cashConstraints: ['component_prepayment', 'customer_acceptance_delay'],
    failureStates: ['commissioning_delay', 'customer_concentration'],
    recoveryPaths: ['standard_cell_redesign', 'service_partner_network'],
    governanceFocus: 'delivery_quality_and_founder_delegation',
    reservedMatter: 'new_assembly_line',
    employeeGroups: ['robotics_engineers', 'commissioning_crews'],
    customerGroups: ['small_factories', 'industrial_system_integrators'],
  },
  {
    companyId: 'company_hesheng_auto',
    canonicalName: '合成汽车',
    historicalOrigin: '由整车制造、车载软件与服务网络逐步整合形成。',
    ecosystemRole: '模型、芯片与消费者责任交汇的智能汽车应用方',
    cityPresence: ['合成汽车总装基地', '城市交付与服务中心'],
    milestones: [
      ['vehicle_platform', '建立统一整车与软件平台'],
      ['assisted_intelligence', '车载智能功能进入受限交付和持续服务阶段'],
    ],
    modelKind: 'intelligent_vehicle_platform',
    products: [product('intelligent_vehicle', 'vehicle_and_service', 'delivered_vehicle')],
    revenueDrivers: ['vehicle_delivery', 'software_service', 'maintenance_service'],
    costDrivers: ['components', 'manufacturing', 'warranty_and_safety'],
    capacityConstraints: ['qualified_chips', 'assembly_capacity', 'service_network'],
    revenueRecognition: '整车交付与软件服务期分别确认收入。',
    cashConstraints: ['supplier_commitment', 'warranty_reserve'],
    failureStates: ['delivery_inventory_build', 'product_safety_recall'],
    recoveryPaths: ['production_rebalance', 'verified_recall_and_remediation'],
    governanceFocus: 'product_safety_and_data_governance',
    reservedMatter: 'major_intelligent_feature_release',
    employeeGroups: ['vehicle_engineers', 'service_technicians'],
    customerGroups: ['household_vehicle_buyers', 'fleet_operators'],
  },
  {
    companyId: 'company_yuansheng_media',
    canonicalName: '远声传媒',
    historicalOrigin: '由城市内容机构、版权库和数字分发团队整合形成。',
    ecosystemRole: '内容、版权、公众信息与生成工具的社会传播节点',
    cityPresence: ['远声编辑中心', '城市版权档案馆'],
    milestones: [
      ['editorial_origin', '建立城市新闻与文化内容编辑体系'],
      ['rights_archive', '完成可追溯版权库和数字分发系统'],
      ['assisted_creation', '引入带来源标识和人工复核的生成工具'],
    ],
    modelKind: 'rights_based_media_platform',
    products: [product('verified_media_service', 'media_and_rights_service', 'verified_publication')],
    revenueDrivers: ['subscription', 'advertising_contract', 'rights_license'],
    costDrivers: ['editorial_team', 'rights_license', 'distribution_service'],
    capacityConstraints: ['editorial_attention', 'rights_clearance'],
    revenueRecognition: '订阅、广告履约和版权授权分别按合同结算。',
    cashConstraints: ['rights_commitment', 'content_liability_reserve'],
    failureStates: ['rights_dispute', 'credibility_loss'],
    recoveryPaths: ['public_correction', 'rights_reclearance'],
    governanceFocus: 'editorial_independence_and_rights',
    reservedMatter: 'exclusive_model_content_contract',
    employeeGroups: ['journalists_and_editors', 'rights_specialists'],
    customerGroups: ['resident_audiences', 'brand_and_enterprise_clients'],
  },
]);

const RELATIONSHIPS = Object.freeze([
  ['company_qianfeng_resources', 'company_frontier_semiconductor', 'critical_minerals', '合格矿批交割与品位复核', ['mineral_grade_shortfall']],
  ['company_aurora_materials', 'company_frontier_semiconductor', 'advanced_materials', '合格材料批次验收', ['material_batch_rejected']],
  ['company_frontier_semiconductor', 'company_yuncen_compute', 'accelerator_lot', '芯片批次认证、交付与上架', ['accelerator_qualification_delayed']],
  ['company_guangmai_interconnect', 'company_yuncen_compute', 'interconnect_capacity', '互连端口交付与集群联调', ['interconnect_delivery_shortfall']],
  ['company_anlan_grid', 'company_yuncen_compute', 'power_capacity', '容量协议可用性与实际供电', ['power_capacity_shortfall']],
  ['company_haifeng_new_energy', 'company_anlan_grid', 'renewable_generation_equipment', '设备验收与运维履约', ['generation_equipment_delay']],
  ['company_haifeng_new_energy', 'company_yuncen_compute', 'renewable_power_contract', '已交付电量与容量可用性', ['renewable_delivery_shortfall']],
  ['company_rongyue_data', 'company_tianyan_intelligence', 'data_rights_bundle', '授权范围、质量与撤回义务验收', ['data_rights_scope_failed']],
  ['company_yuncen_compute', 'company_tianyan_intelligence', 'compute_capacity', '预留容量履约和实际使用量', ['compute_delivery_shortfall']],
  ['company_frontier_semiconductor', 'company_tianyan_intelligence', 'accelerator_allocation', '合格芯片批次分配与交付', ['accelerator_allocation_delayed']],
  ['company_mingjian_security', 'company_tianyan_intelligence', 'independent_safety_assurance', '独立安全案例与整改复核', ['safety_case_rejected']],
  ['company_tianyan_intelligence', 'company_qunxing_cloud', 'model_service', '核对后的服务调用与可用性', ['model_service_breach']],
  ['company_qunxing_cloud', 'company_horizon_software', 'model_distribution', '企业调用量、可用性与退出迁移', ['distribution_service_breach']],
  ['company_horizon_software', 'company_qiming_robotics', 'industrial_agent_software', '现场实施验收与订阅期', ['industrial_agent_pilot_failed']],
  ['company_tianyan_intelligence', 'company_hesheng_auto', 'model_license', '受限能力交付、安全边界与服务期', ['vehicle_model_release_blocked']],
  ['company_tianyan_intelligence', 'company_yuansheng_media', 'content_tool_service', '合资格工具调用与内容来源标识', ['content_tool_service_suspended']],
  ['company_mingjian_security', 'company_hesheng_auto', 'vehicle_safety_assurance', '产品安全审查与整改复核', ['vehicle_safety_case_failed']],
  ['company_rongyue_data', 'company_yuansheng_media', 'rights_clearance_service', '版权与数据用途逐项验收', ['rights_clearance_failed']],
].map((entry, index) => Object.freeze({
  id: `company_relation_v2_${String(index + 1).padStart(3, '0')}`,
  fromCompanyId: entry[0],
  toCompanyId: entry[1],
  relationshipKind: 'contractual_supply',
  resourceType: entry[2],
  settlementBasis: entry[3],
  failureFactKinds: Object.freeze([...entry[4]]),
})));

function standardShareholders(companyId) {
  const stem = companyId.replace(/^company_/, '');
  return [
    {
      holderId: `${stem}_controller`,
      holderType: 'founder_or_controller',
      economicInterestBps: 2_500,
      votingRightsBps: 3_500,
      controlRole: 'controller',
    },
    {
      holderId: `${stem}_employee_trust`,
      holderType: 'employee_trust',
      economicInterestBps: 500,
      votingRightsBps: 500,
      controlRole: 'employee_interest',
    },
    {
      holderId: 'public_float',
      holderType: 'public_float',
      economicInterestBps: 7_000,
      votingRightsBps: 6_000,
      controlRole: 'minority_shareholders',
    },
  ];
}

function governance(definition) {
  const committees = [
    { id: 'audit_risk', mandate: '审查财务、风险、内控与重大合同。' },
    {
      id: definition.governanceFocus,
      mandate: `监督 ${definition.governanceFocus} 的事实、责任与纠偏。`,
    },
    ...(definition.extraCommittees ?? []),
  ];
  return {
    boardSeatCount: definition.boardSeatCount ?? 7,
    committees,
    reservedMatters: [
      definition.reservedMatter,
      'related_party_transaction',
      ...(definition.extraReservedMatters ?? []),
    ],
    conflictPolicy:
      '关联董事回避；材料、表决、授权与执行事实分别保存。',
    executiveRoles: [
      { role: 'chief_executive', mandate: '在董事会授权内组织经营与履约。' },
      { role: 'finance_lead', mandate: '管理现金、资本承诺和财务披露。' },
      { role: 'operating_or_technical_lead', mandate: '负责产品、能力与交付证据。' },
    ],
  };
}

function extensionFor(definition, identity) {
  return {
    identity: {
      id: identity.id,
      symbol: identity.symbol,
      name: identity.name,
      shortName: identity.shortName,
    },
    standing: {
      historicalOrigin: definition.historicalOrigin,
      ecosystemRole: definition.ecosystemRole,
      cityPresence: [...definition.cityPresence],
    },
    history: {
      milestones: definition.milestones.map(
        ([id, description], sequence) => ({
          id,
          sequence: sequence + 1,
          description,
          authorityRequirement: 'settled_fact_reference',
        }),
      ),
    },
    business: {
      modelKind: definition.modelKind,
      products: definition.products.map((entry) => ({ ...entry })),
      revenueDrivers: [...definition.revenueDrivers],
      costDrivers: [...definition.costDrivers],
      capacityConstraints: [...definition.capacityConstraints],
    },
    financialMechanism: {
      revenueRecognition: definition.revenueRecognition,
      cashConstraints: [...definition.cashConstraints],
      failureStates: [...definition.failureStates],
      recoveryPaths: [...definition.recoveryPaths],
      settlementFactKinds: [
        'contract_performance',
        'cash_receipt_or_payment',
        'capacity_delivery',
      ],
    },
    governance: governance(definition),
    shareholders: (definition.shareholders ??
      standardShareholders(definition.companyId)).map(
      (holder) => ({ ...holder }),
    ),
    stakeholderGroups: {
      employeeGroups: [...definition.employeeGroups],
      customerGroups: [...definition.customerGroups],
      supplierRelationshipIds: RELATIONSHIPS.filter(
        (edge) => edge.toCompanyId === definition.companyId,
      ).map((edge) => edge.id),
    },
    informationPolicy: {
      public: [
        'canonical_identity',
        'settled_disclosures',
        'completed_contract_outcomes',
      ],
      organizationInternal: [
        'open_operating_obligations',
        'approved_governance_materials',
      ],
      contractParties: [
        'contract_scope',
        'delivery_and_payment_status',
      ],
      privateActor: [
        'negotiation_limit',
        'unsubmitted_plan',
      ],
    },
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

export function buildCompanyUniverseV2(canonicalCatalog) {
  if (!Array.isArray(canonicalCatalog)) {
    fail('INVALID_CANONICAL_CATALOG', 'Canonical company catalog is required.');
  }
  const catalogById = new Map();
  for (const company of canonicalCatalog) {
    if (
      !company ||
      typeof company.id !== 'string' ||
      !company.id ||
      typeof company.name !== 'string' ||
      !company.name
    ) {
      fail('INVALID_CANONICAL_CATALOG', 'Canonical company identity is invalid.');
    }
    if (catalogById.has(company.id)) {
      fail('DUPLICATE_CANONICAL_COMPANY', `Duplicate canonical company: ${company.id}`);
    }
    catalogById.set(company.id, company);
  }

  const companies = {};
  for (const definition of DEFINITIONS) {
    const canonical = catalogById.get(definition.companyId);
    if (!canonical) {
      fail(
        'MISSING_CANONICAL_COMPANY',
        `Missing canonical company: ${definition.companyId}`,
      );
    }
    if (canonical.name !== definition.canonicalName) {
      fail(
        'CANONICAL_IDENTITY_MISMATCH',
        `Canonical identity mismatch: ${definition.companyId}`,
      );
    }
    companies[definition.companyId] = extensionFor(
      definition,
      canonical,
    );
  }
  for (const edge of RELATIONSHIPS) {
    for (const companyId of [
      edge.fromCompanyId,
      edge.toCompanyId,
    ]) {
      if (!catalogById.has(companyId)) {
        fail(
          'MISSING_CANONICAL_COMPANY',
          `Relationship references missing company: ${companyId}`,
        );
      }
    }
  }

  const universe = {
    schema: COMPANY_UNIVERSE_SCHEMA,
    mode: 'additive_extension',
    contentVersion: 'company_universe_v2_2026_08_02',
    canonicalCompanyCount: canonicalCatalog.length,
    canonicalCompanyIds: [...catalogById.keys()].sort((left, right) =>
      left.localeCompare(right),
    ),
    companies,
    relationships: RELATIONSHIPS.map((edge) => ({
      ...edge,
      failureFactKinds: [...edge.failureFactKinds],
    })),
    authorityBoundary: {
      writesCanonicalCompany: false,
      writesOrderBook: false,
      integrationRequirement:
        'controller_merges_by_canonical_company_id',
    },
  };
  const audit = auditCompanyUniverseV2(universe);
  if (!audit.ok) {
    fail(
      'INVALID_COMPANY_UNIVERSE_V2',
      audit.errors.join(';'),
    );
  }
  return deepFreeze(universe);
}

function validStringArray(value, minimum = 1) {
  return (
    Array.isArray(value) &&
    value.length >= minimum &&
    value.every(
      (entry) => typeof entry === 'string' && entry.length > 0,
    )
  );
}

export function auditCompanyUniverseV2(universe) {
  const errors = [];
  if (
    !universe ||
    universe.schema !== COMPANY_UNIVERSE_SCHEMA ||
    universe.mode !== 'additive_extension' ||
    !Number.isSafeInteger(universe.canonicalCompanyCount) ||
    universe.canonicalCompanyCount < DEFINITIONS.length ||
    !universe.companies ||
    Array.isArray(universe.companies) ||
    !Array.isArray(universe.relationships) ||
    !Array.isArray(universe.canonicalCompanyIds)
  ) {
    return {
      ok: false,
      errors: ['INVALID_COMPANY_UNIVERSE_V2'],
    };
  }
  const canonicalIds = new Set(universe.canonicalCompanyIds);
  for (const definition of DEFINITIONS) {
    const company = universe.companies[definition.companyId];
    if (
      !company ||
      company.identity?.id !== definition.companyId ||
      company.identity?.name !== definition.canonicalName ||
      !validStringArray(company.standing?.cityPresence) ||
      !Array.isArray(company.history?.milestones) ||
      company.history.milestones.length < 2 ||
      !validStringArray(company.business?.revenueDrivers) ||
      !validStringArray(company.business?.costDrivers) ||
      !validStringArray(company.business?.capacityConstraints) ||
      !Array.isArray(company.business?.products) ||
      company.business.products.length === 0 ||
      !validStringArray(company.financialMechanism?.cashConstraints) ||
      !validStringArray(company.financialMechanism?.failureStates) ||
      !validStringArray(company.financialMechanism?.recoveryPaths) ||
      !Number.isSafeInteger(company.governance?.boardSeatCount) ||
      company.governance.boardSeatCount < 5 ||
      !Array.isArray(company.governance?.committees) ||
      company.governance.committees.length < 2 ||
      !Array.isArray(company.shareholders) ||
      company.shareholders.length < 2
    ) {
      errors.push(`INVALID_COMPANY_EXTENSION:${definition.companyId}`);
      continue;
    }
    const economic = company.shareholders.reduce(
      (sum, holder) => sum + holder.economicInterestBps,
      0,
    );
    const voting = company.shareholders.reduce(
      (sum, holder) => sum + holder.votingRightsBps,
      0,
    );
    if (economic !== 10_000 || voting !== 10_000) {
      errors.push(`INVALID_SHAREHOLDER_TOTAL:${definition.companyId}`);
    }
    for (const holder of company.shareholders) {
      if (
        holder.holderType === 'company' &&
        !canonicalIds.has(holder.holderId)
      ) {
        errors.push(`UNKNOWN_COMPANY_SHAREHOLDER:${holder.holderId}`);
      }
    }
  }
  const relationshipIds = new Set();
  for (const edge of universe.relationships) {
    if (
      !edge ||
      typeof edge.id !== 'string' ||
      relationshipIds.has(edge.id) ||
      !canonicalIds.has(edge.fromCompanyId) ||
      !canonicalIds.has(edge.toCompanyId) ||
      edge.fromCompanyId === edge.toCompanyId ||
      typeof edge.resourceType !== 'string' ||
      !edge.resourceType ||
      typeof edge.settlementBasis !== 'string' ||
      !edge.settlementBasis ||
      !validStringArray(edge.failureFactKinds)
    ) {
      errors.push(`INVALID_COMPANY_RELATIONSHIP:${edge?.id ?? 'unknown'}`);
    }
    relationshipIds.add(edge?.id);
  }
  const uniqueErrors = [...new Set(errors)].sort((left, right) =>
    left.localeCompare(right),
  );
  return {
    ok: uniqueErrors.length === 0,
    errors: uniqueErrors,
  };
}
