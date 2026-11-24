import assert from 'node:assert/strict';
import test from 'node:test';

import {
  inflowCounts,
  MAX_INTERVAL,
  MIN_INTERVAL,
  SLOTS,
  slotOf,
  sniperIntervals,
  sniperProfile,
} from '../inflow-profile.mjs';
import {
  createScanScheduler,
  getScanSchedule,
  nextSniperRunAt,
  saveSniper,
} from '../scan-schedule.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

/** Local-time date builder: the profile works in the machine's own hours. */
const local = (day, hour, minute = 0) => new Date(2026, 10, day, hour, minute, 0).getTime();
const AT = local(28, 12);

/** Offers first seen over the last 20 days: many in the evening (18-21), a few in the night. */
function evenings(repository) {
  let n = 0;
  const add = (time) =>
    repository.upsertOffer({
      id: `o${n++}`,
      source: 'Vinted',
      normalizedUrl: `https://example.test/${n}`,
      originalTitle: 'Mort',
      currentPrice: 2000,
      firstSeenAt: new Date(time).toISOString(),
    });
  for (let day = 8; day <= 27; day++) {
    for (let i = 0; i < 16; i++) add(local(day, 18 + (i % 4), (i * 7) % 60));
    add(local(day, 3));
  }
  // Scanned around the clock, so the evening peak is a property of the market, not of the scanning.
  addScans(repository, 1, 27, allHours);
}
/** One scan run per listed hour of each day in the range (the scan history the profile divides by). */
function addScans(repository, fromDay, toDay, hours) {
  const insert = repository.database.prepare(
    'INSERT OR REPLACE INTO scan_runs(scanned_at,summary_json,created_at) VALUES(?,?,?)',
  );
  for (let day = fromDay; day <= toDay; day++)
    for (const hour of hours) {
      const at = new Date(local(day, hour, 5)).toISOString();
      insert.run(at, '{}', at);
    }
}
const allHours = Array.from({ length: 24 }, (_, hour) => hour);
const scansPerWeek = (intervals) => intervals.reduce((sum, minutes) => sum + 60 / minutes, 0);

test('a known evening peak gets the shortest interval, the night the longest, all within bounds', () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    evenings(repository);
    const profile = sniperProfile(repository, 20, { at: AT });
    assert.equal(profile.enough, true);
    assert.equal(profile.intervals.length, SLOTS);
    for (const minutes of profile.intervals)
      assert.ok(minutes >= MIN_INTERVAL && minutes <= MAX_INTERVAL);
    // Every weekday: 19:00 is the peak, 05:00 the quiet.
    for (let day = 0; day < 7; day++) {
      assert.equal(profile.intervals[day * 24 + 19], MIN_INTERVAL);
      assert.equal(profile.intervals[day * 24 + 5], MAX_INTERVAL);
    }
    // The weekly number of scans does not exceed the fixed interval's.
    assert.ok(scansPerWeek(profile.intervals) <= SLOTS * (60 / 20) + 1e-9);
  } finally {
    repository.close();
  }
});

test('too little history gives the fixed interval everywhere', () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    // Plenty of offers but only three days of them: not enough to trust a pattern.
    for (let i = 0; i < 300; i++)
      repository.upsertOffer({
        id: `s${i}`,
        source: 'Vinted',
        normalizedUrl: `https://example.test/s${i}`,
        originalTitle: 'Mort',
        currentPrice: 2000,
        firstSeenAt: new Date(local(25 + (i % 3), 19)).toISOString(),
      });
    const profile = sniperProfile(repository, 30, { at: AT });
    assert.equal(profile.enough, false);
    assert.deepEqual(profile.intervals, new Array(SLOTS).fill(30));
    assert.deepEqual(sniperIntervals(new Array(SLOTS).fill(0), 20), new Array(SLOTS).fill(20));
  } finally {
    repository.close();
  }
});

test('for any pattern the intervals stay within bounds and the weekly budget never grows', () => {
  let seed = 11;
  const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (const base of [15, 20, 30, 60])
    for (let round = 0; round < 25; round++) {
      const counts = Array.from({ length: SLOTS }, () => Math.floor(random() ** 3 * 100));
      const intervals = sniperIntervals(counts, base);
      for (const minutes of intervals)
        assert.ok(minutes >= MIN_INTERVAL && minutes <= MAX_INTERVAL);
      assert.ok(
        scansPerWeek(intervals) <= SLOTS * (60 / base) + 1e-9,
        `base ${base}, round ${round}`,
      );
    }
  assert.equal(inflowCounts(new SqliteCatalogRepository(':memory:'), { at: AT }).offers, 0);
});

test('the next sniper run follows the interval of the hour of the last run; non-adaptive stays fixed', () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    evenings(repository);
    saveSniper(repository, { enabled: true, everyMinutes: 20, adaptive: true }, AT);
    const schedule = getScanSchedule(repository);
    assert.equal(schedule.sniper.adaptive, true);
    assert.equal(schedule.sniper.profile.intervals.length, SLOTS);
    const peak = local(30, 19, 10);
    const quiet = local(30, 5, 10);
    const at = (lastRunAt) => ({
      sniper: { ...schedule.sniper, lastRunAt: new Date(lastRunAt).toISOString() },
    });
    assert.equal(nextSniperRunAt(at(peak)), peak + 15 * 60_000);
    assert.equal(nextSniperRunAt(at(quiet)), quiet + 60 * 60_000);
    // Switched off: the fixed interval again, and the profile is dropped.
    saveSniper(repository, { enabled: true, everyMinutes: 20, adaptive: false }, AT);
    const plain = getScanSchedule(repository);
    assert.equal(plain.sniper.adaptive, false);
    assert.equal(plain.sniper.profile, null);
    assert.equal(
      nextSniperRunAt({ sniper: { ...plain.sniper, lastRunAt: new Date(peak).toISOString() } }),
      peak + 20 * 60_000,
    );
    assert.equal(slotOf(local(30, 19, 10)), new Date(local(30, 19, 10)).getDay() * 24 + 19);
  } finally {
    repository.close();
  }
});

test('one first big scan or import in a single hour does not make that hour the busiest', () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    evenings(repository);
    // 5000 offers first seen within one hour of day 27 (a Friday, 03:xx).
    for (let i = 0; i < 5000; i++)
      repository.upsertOffer({
        id: `imp${i}`,
        source: 'Vinted',
        normalizedUrl: `https://example.test/imp${i}`,
        originalTitle: 'Mort',
        currentPrice: 2000,
        firstSeenAt: new Date(local(27, 3, i % 60)).toISOString(),
      });
    const { counts, offers } = inflowCounts(repository, { at: AT });
    const slot = slotOf(local(27, 3));
    assert.ok(counts[slot] < counts[slotOf(local(27, 19))], `import hour ${counts[slot]}`);
    assert.ok(offers < 500, `the import adds a bounded amount, got ${offers}`);
    const profile = sniperProfile(repository, 20, { at: AT });
    assert.equal(profile.intervals[slotOf(local(27, 19))], MIN_INTERVAL);
    assert.ok(scansPerWeek(profile.intervals) <= SLOTS * (60 / 20) + 1e-9);
  } finally {
    repository.close();
  }
});

test('an import alone cannot make the history look sufficient', () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    for (let i = 0; i < 3000; i++)
      repository.upsertOffer({
        id: `only${i}`,
        source: 'Vinted',
        normalizedUrl: `https://example.test/only${i}`,
        originalTitle: 'Mort',
        currentPrice: 2000,
        firstSeenAt: new Date(local(10, 15, i % 60)).toISOString(),
      });
    assert.ok(inflowCounts(repository, { at: AT }).offers < 200);
    assert.equal(sniperProfile(repository, 20, { at: AT }).enough, false);
  } finally {
    repository.close();
  }
});

test('saveSniper works the profile out again only when the base interval or the switch changes', () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    const first = saveSniper(repository, { enabled: true, everyMinutes: 20, adaptive: true }, AT);
    assert.equal(first.profile.computedAt, new Date(AT).toISOString());
    assert.deepEqual(first.profile.intervals, new Array(SLOTS).fill(20), 'no data: fixed interval');
    // Same interval and switch, later: the stored profile is kept.
    const same = saveSniper(repository, { enabled: false, adaptive: true }, AT + 3_600_000);
    assert.equal(same.profile.computedAt, first.profile.computedAt);
    // New base interval: worked out again.
    const changed = saveSniper(repository, { everyMinutes: 30 }, AT + 2 * 3_600_000);
    assert.equal(changed.profile.computedAt, new Date(AT + 2 * 3_600_000).toISOString());
    assert.deepEqual(changed.profile.intervals, new Array(SLOTS).fill(30));
    // Off: dropped. On again: worked out again.
    assert.equal(saveSniper(repository, { adaptive: false }, AT + 3 * 3_600_000).profile, null);
    const back = saveSniper(repository, { adaptive: true }, AT + 4 * 3_600_000);
    assert.equal(back.profile.computedAt, new Date(AT + 4 * 3_600_000).toISOString());
  } finally {
    repository.close();
  }
});

test('the scheduler refreshes the profile after a day, not before, and not when adaptive is off', async () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    saveSniper(repository, { enabled: true, everyMinutes: 20, adaptive: true }, AT);
    const computedAt = () => getScanSchedule(repository).sniper.profile?.computedAt;
    assert.equal(computedAt(), new Date(AT).toISOString());
    let clock = AT;
    const scheduler = createScanScheduler({
      getRepository: () => repository,
      runScan: async () => 200,
      getTargets: () => [{ phrase: 'Mort' }],
      now: () => clock,
    });
    clock = AT + 30 * 60_000;
    assert.equal((await scheduler.tick()).sniper, true);
    assert.equal(computedAt(), new Date(AT).toISOString(), 'half an hour: kept');
    clock = AT + 23 * 3_600_000;
    assert.equal((await scheduler.tick()).sniper, true);
    assert.equal(computedAt(), new Date(AT).toISOString(), '23 h: kept');
    clock = AT + 25 * 3_600_000;
    assert.equal((await scheduler.tick()).sniper, true);
    assert.equal(computedAt(), new Date(clock).toISOString(), '25 h: refreshed');
    // Adaptive off: the next run leaves no profile.
    saveSniper(repository, { enabled: true, adaptive: false }, clock);
    clock += 2 * 3_600_000;
    assert.equal((await scheduler.tick()).sniper, true);
    assert.equal(getScanSchedule(repository).sniper.profile, null);
  } finally {
    repository.close();
  }
});

test('sniperProfile reads an in-memory repository', () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    const profile = sniperProfile(repository, 60, { at: AT });
    assert.equal(profile.enough, false);
    assert.equal(profile.offers, 0);
    assert.equal(profile.computedAt, new Date(AT).toISOString());
    assert.deepEqual(profile.intervals, new Array(SLOTS).fill(60));
  } finally {
    repository.close();
  }
});

test('offers seen only because the owner scans in the evening do not make a peak: the profile stays flat', () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    let n = 0;
    // 20 days, all offers and all scans in 19-23 (the measured 91.7% in 5 hours, cut to the extreme).
    for (let day = 8; day <= 27; day++)
      for (let hour = 19; hour <= 23; hour++)
        for (let i = 0; i < 10; i++)
          repository.upsertOffer({
            id: `c${n++}`,
            source: 'Vinted',
            normalizedUrl: `https://example.test/c${n}`,
            originalTitle: 'Mort',
            currentPrice: 2000,
            firstSeenAt: new Date(local(day, hour, i * 5)).toISOString(),
          });
    addScans(repository, 1, 27, [19, 20, 21, 22, 23]);
    const profile = sniperProfile(repository, 20, { at: AT });
    assert.ok(profile.offers >= 200 && profile.spanDays >= 14, 'plenty of history');
    assert.equal(profile.enough, false);
    assert.equal(profile.reason, 'coverage');
    assert.ok(profile.coverage < 0.5);
    assert.deepEqual(profile.intervals, new Array(SLOTS).fill(20));
  } finally {
    repository.close();
  }
});

test('hours without enough scans keep the base interval, never 60 and never below it', () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    evenings(repository);
    // Remove the scans of the night 0-5: those hours become unknown although they have no offers.
    repository.database
      .prepare(
        "DELETE FROM scan_runs WHERE CAST(strftime('%H', scanned_at, 'localtime') AS INTEGER) < 6",
      )
      .run();
    const profile = sniperProfile(repository, 30, { at: AT });
    assert.equal(profile.enough, true);
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 6; hour++)
        assert.equal(profile.intervals[day * 24 + hour], 30, 'unknown hour: base');
      assert.equal(profile.intervals[day * 24 + 19], MIN_INTERVAL);
      assert.equal(profile.intervals[day * 24 + 8], MAX_INTERVAL, 'a scanned quiet hour is slow');
    }
    assert.ok(scansPerWeek(profile.intervals) <= SLOTS * (60 / 30) + 1e-9);
  } finally {
    repository.close();
  }
});
