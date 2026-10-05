import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PEOPLE_FILTERS, peopleSearchParams, discoveryErrorMessage, eligiblePeople } from '../src/lib/people-finder.js';
test('people filters enforce adult bounded ranges and optional gender', () => {
  assert.deepEqual(peopleSearchParams(DEFAULT_PEOPLE_FILTERS), { p_min_age:18,p_max_age:100,p_max_distance_km:40,p_gender_identities:null,p_limit:50,p_offset:0 });
  const params=peopleSearchParams({minAge:12,maxAge:10,distanceKm:999,gender:'Woman'});
  assert.equal(params.p_min_age,18); assert.equal(params.p_max_age,18); assert.equal(params.p_max_distance_km,250); assert.deepEqual(params.p_gender_identities,['Woman']);
});
test('discovery setup errors remain distinct from empty results', () => {
  assert.match(discoveryErrorMessage('Turn on People discovery before browsing people.'),/Settings/);
  assert.equal(discoveryErrorMessage('Network unavailable'),'Network unavailable');
});
test('result guard excludes self, minors and invalid distance without fabricating profiles', () => {
  assert.deepEqual(eligiblePeople([{id:'self',age:30,distance_km:1},{id:'minor',age:17,distance_km:1},{id:'bad',age:30,distance_km:NaN},{id:'adult',age:21,distance_km:2.3}], 'self').map(p=>p.id),['adult']);
});
