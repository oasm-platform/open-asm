import {
  DB_POOL_SIZE,
  JOB_RESULT_CONCURRENCY,
  MAX_CONCURRENT_RUN_ADVANCES,
} from '@/common/constants/app.constants';
import { dataSourceOptions } from './database-config';

describe('dataSourceOptions', () => {
  it('sizes the connection pool explicitly instead of the driver default of 10', () => {
    expect(dataSourceOptions.poolSize).toBe(DB_POOL_SIZE);
  });

  it('leaves connections for claims and requests when results and advances peak', () => {
    // Every result processor and every admitted advance can hold a connection
    // at once; an advance borrows one more while it holds the run's lock.
    const peak = JOB_RESULT_CONCURRENCY + 2 * MAX_CONCURRENT_RUN_ADVANCES;
    expect(peak).toBeLessThan(DB_POOL_SIZE);
  });
});
