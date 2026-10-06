// CrestX PPC — environment & API contract configuration.
// Mirrors lib/common_config/*, lib/common_constants/* from the Flutter app.

export const APP_MODE = 'uat'; // matches ApiService() hardcoded default

export const APP_SETTINGS = {
  uat: { applicationId: 'crest_mobile_app', host: 'uat-api.crest-erp.com', scheme: 'https' },
};

export const ACTIVE_SETTINGS = APP_SETTINGS[APP_MODE];

export const ENDPOINTS = {
  init: 'api/crest/mobile/tenant/v1',
  login: 'api/crest/mobile/login/v1',
  refreshToken: 'api/crest/mobile/login/refreshToken',
};

export const API_CONTEXT_STATIC = {
  application: 'CREST',
  applicationId: '123456789',
  tenantId: 'galvauat',
  txprotocol: 'SYNC',
  securityKey: 'XYZMSJCH7675BFHFG',
  version: '1.0',
  correlationId: 'ABCD-12345',
};

export const TXN = {
  login: 'CRE_USER_LOGIN',
  userPermission: 'LOGIN_COMPONENT_GET',
  menuPermissionList: 'PRODUCTION_REPORTING_INIT',

  // Transfer
  getFacilityLocation: 'TRANSFER_FACILITY_LOCATION_GET',
  productLookupInit: 'PRODUCT_LOOKUP_INIT',
  transferSubmit: 'TRANSFER_MATERIAL',
  getOrganization: 'ORGANISATION_DROPDOWN',
  transferGetDetails: 'TRANSFER_GET_DETAIL',
  searchProductIdLookUp: 'PRODUCT_LOOKUP_LIST',
  transferInit: 'TRANSFER_INIT',

  // Production Reporting
  getFacility: 'SHIPMENT_GET_FACILITY',
  getWorkcenter: 'WORK_CENTER_GET',
  getShift: 'PROD_SHIFT_INIT',
  searchProdReporting: 'SEARCH_PROD_REPORTING',
  getMachineNumber: 'PROD_MACHINE_NUMBER_INIT',
  getProducts: 'PROD_PRODUCT_ID_INIT',
  getDownTimeReason: 'PROD_DOWNTIME_REASON',
  createToolList: 'GET_PRODUCT_TOOLS',
  operatorInspectedBy: 'PROD_WC_INIT',
  rejectReasonDropDown: 'PROD_REJECTION_REASON',
  reWorkReasonDropDown: 'PROD_REWORK_REASON',
  editReporting: 'VIEW_PROD_REPORTING',
  removeTableAPI: 'UPDATE_PRODUCTION_STATUS',
  cancelConsumption: 'CANCEL_CONSUMPTION_DETAIL',
  downLoadProductionRunPdf: 'GET_PRODUCTION_RUN_PDF',
  createReporting: 'CREATE_QUICK_PRODUCTION_RUN',
  getConsumptionProduct: 'GET_PRODUCT_DROPDOWN',
  getBomAddtionalItem: 'GET_BOM_ADDITIONAL_ITEM',
  getBomItem: 'GET_BOM_ITEMS',
  getAddScarp: 'GET_ADDITIONAL_SCRAP_LIST',
  getAddScarpDetails: 'GET_SCRAP_DETAILS',
  submitBomItem: 'CREATE_BOM_ITEM',
  viewSummary: 'VIEW_SUMMARY',
  finalComplete: 'UPDATE_REMARKS',
  completeConsumption: 'COMPLETE_CONSUMPTION_DETAIL',
  removeConsumerAPI: 'REMOVE_PROD_RUN_CUSTOM',
  viewConsumptionReporting: 'GET_CONSUMPTION_DETAILS',
  getIotData: 'GET_PRODUCTION_RUN_DATA_IOT',
  createIotData: 'CREATE_QUICK_PRODUCTION_RUN_IOT',

  // Machine Mapping
  getMachineMappingList: 'GET_MACHINE_MAPPING_LIST',
  getMachineMappingInit: 'MAC_MAP_INIT',
  createMachineMapping: 'CREATE_MACHINE_MAPPING',
  updateMachineMapping: 'UPDATE_MACHINE_MAPPING',
  deleteMachineMapping: 'DELETE_MACHINE_MAPPING',

  // Part Schedule
  getPartScheduleList: 'GET_PART_SCHEDULE_LIST',
  getOrderListPartSchedule: 'GET_ORDER_LIST_PART_SCHEDULE',
  getOrderProductListPartSchedule: 'GET_ORDER_PRODUCT_LIST_PART_SCHEDULE',
  createPartSchedule: 'CREATE_PART_SCHEDULE',
  updatePartSchedule: 'UPDATE_PART_SCHEDULE',
  deletePartSchedule: 'DELETE_PART_SCHEDULE',
  runMrp: 'RUN_MRP',

  // MRP Output
  getMrpList: 'GET_MRP_LIST',
  createRequirement: 'CREATE_REQUIREMENT',
  getRequirementType: 'GET_REQUIREMENT_TYPE_INIT',

  // Plan
  getPartPlanList: 'GET_PART_PLAN_LIST',
  createPartPlan: 'CREATE_PART_PLAN',
  updatePartPlan: 'UPDATE_PART_PLAN',
  deletePartPlan: 'DELETE_PART_PLAN',
  createPartPlanMrp: 'CREATE_PART_PLAN_MRP',
  runCrpPlan: 'RUN_CRP_PLAN',

  // Holidays
  getHolidaysList: 'GET_HOLIDAYS_LIST',
  createHolidays: 'CREATE_HOLIDAYS',
  updateHolidays: 'UPDATE_HOLIDAYS',
  deleteHolidays: 'DELETE_HOLIDAYS',
};

export const PAGE_SIZES = ['10', '20', '30', '50', '100', '200'];

// Permission-key -> nav item metadata (mirrors LoginScreenProvider.getUserPermission)
export const NAV_ITEMS = [
  { permKey: 'PRODUCTION_REPORTING', title: 'Production Reporting', route: '#/production-reporting', icon: 'receipt-long' },
  { permKey: 'TRANSFER', title: 'Transfer', route: '#/transfer', icon: 'transfer' },
  { permKey: 'MACHINE_MAPPING', title: 'Machine Mapping', route: '#/machine-mapping', icon: 'settings' },
  { permKey: 'PART_SO_PLANNING', title: 'SO Planning', route: '#/so-planning', icon: 'assignment' },
  { permKey: 'PART_SCHEDULE', title: 'Part Schedule', route: '#/schedule', icon: 'calendar' },
  { permKey: 'MRP_OUTPUT', title: 'MRP Output', route: '#/mrp-output', icon: 'table' },
  { permKey: 'PART_PLAN', title: 'Plan', route: '#/plan', icon: 'event-note' },
  { permKey: 'PART_HOLIDAY', title: 'Holidays', route: '#/holidays', icon: 'event-available' },
];
