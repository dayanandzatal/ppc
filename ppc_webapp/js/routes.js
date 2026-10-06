// Central route table. Each loader is a dynamic import so pages are only
// fetched when the user actually navigates to them.
export const routes = [
  { path: '/production-reporting', permKey: 'PRODUCTION_REPORTING', loader: () => import('./pages/productionReporting/search.js') },
  { path: '/production-reporting/create', permKey: 'PRODUCTION_REPORTING', loader: () => import('./pages/productionReporting/createView.js') },
  { path: '/production-reporting/edit/:id', permKey: 'PRODUCTION_REPORTING', loader: () => import('./pages/productionReporting/createView.js') },
  { path: '/production-reporting/consumption/:id', permKey: 'PRODUCTION_REPORTING', loader: () => import('./pages/productionReporting/consumption.js') },
  { path: '/production-reporting/iot', permKey: 'PRODUCTION_REPORTING', loader: () => import('./pages/productionReporting/iot.js') },
  { path: '/transfer', permKey: 'TRANSFER', loader: () => import('./pages/transfer.js') },
  { path: '/machine-mapping', permKey: 'MACHINE_MAPPING', loader: () => import('./pages/machineMapping.js') },
  { path: '/so-planning', permKey: 'PART_SO_PLANNING', loader: () => import('./pages/soPlanning.js') },
  { path: '/schedule', permKey: 'PART_SCHEDULE', loader: () => import('./pages/schedule.js') },
  { path: '/mrp-output', permKey: 'MRP_OUTPUT', loader: () => import('./pages/mrpOutput.js') },
  { path: '/plan', permKey: 'PART_PLAN', loader: () => import('./pages/plan.js') },
  { path: '/holidays', permKey: 'PART_HOLIDAY', loader: () => import('./pages/holidays.js') },
];
