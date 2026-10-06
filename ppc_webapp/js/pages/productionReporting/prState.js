// Cross-screen shared state for the Production Reporting module.
// Mirrors the Flutter app's top-level mutable `productionGroupRunid`/`facilityId`
// plus SharedPrefs persistence. We use sessionStorage so the values survive a
// full hash navigation (Create -> Consumption -> Summary -> Search) within the
// same browser tab, and expose a small typed accessor object.
const K = {
  groupId: 'crestx.pr.groupId',
  facilityId: 'crestx.pr.facilityId',
  // statusId is the *effective* create-screen status ("PROD_GROUP_CREATED" or "")
  statusId: 'crestx.pr.statusId',
  // statusIdforConsumption is the raw group status returned by VIEW_PROD_REPORTING
  consumptionStatus: 'crestx.pr.consumptionStatus',
};

function get(k) { return sessionStorage.getItem(k) || ''; }
function set(k, v) { sessionStorage.setItem(k, v == null ? '' : String(v)); }

export const PrState = {
  getGroupId() { return get(K.groupId); },
  setGroupId(v) { set(K.groupId, v); },
  getFacilityId() { return get(K.facilityId); },
  setFacilityId(v) { set(K.facilityId, v); },
  getStatusId() { return get(K.statusId); },
  setStatusId(v) { set(K.statusId, v); },
  getConsumptionStatus() { return get(K.consumptionStatus); },
  setConsumptionStatus(v) { set(K.consumptionStatus, v); },
  clear() {
    Object.values(K).forEach((key) => sessionStorage.removeItem(key));
  },
};
