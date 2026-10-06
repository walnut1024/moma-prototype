import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { countries, chinaRegions, industries, changeEnterpriseLocation } from '../src/admin-v2/enterprise-options.js';

test('parent location changes clear descendants without losing other enterprise fields', () => {
  const form = { countryRegion: '中国', province: '江苏省', city: '南京市', address: '测试地址', companyName: '测试企业' };
  assert.deepEqual(changeEnterpriseLocation(form, 'countryRegion', '美国'), { ...form, countryRegion: '美国', province: '', city: '' });
  assert.deepEqual(changeEnterpriseLocation(form, 'province', '浙江省'), { ...form, province: '浙江省', city: '' });
  assert.equal(form.city, '南京市');
});

test('region snapshots are selectable and industry sections cover A through T', () => {
  assert.equal(countries.find(country => country.code === 'CN').name, '中国');
  assert.equal(new Set(countries.map(country => country.name)).size, countries.length);
  assert.equal(chinaRegions.length, 34);
  assert.ok(chinaRegions.find(region => region.name === '江苏省').cities.includes('南京市'));
  assert.deepEqual(chinaRegions.find(region => region.name === '北京市').cities, ['北京市']);
  assert.equal(industries.map(([code]) => code).join(''), 'ABCDEFGHIJKLMNOPQRST');
  for (const country of countries.filter(country => country.code !== 'CN')) {
    const regions = JSON.parse(fs.readFileSync(new URL(`../public/enterprise-regions/${country.code}.json`, import.meta.url)));
    assert.ok(Array.isArray(regions));
    assert.equal(new Set(regions.map(region => region.name)).size, regions.length, country.code);
    assert.ok(regions.every(region => region.cities.every(city => typeof city === 'string')));
  }
});
