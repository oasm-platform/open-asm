import { JobStatus, WorkerName } from 'src/common/enums/enum';
import { WorkerManager } from 'src/common/interfaces/app.interface';
import { Job } from '../jobs-registry/entities/job.entity';
import { DataSource } from 'typeorm';

export const workers: WorkerManager[] = [
  {
    id: WorkerName.SUBFINDER,
    description: 'Fast passive subdomain enumeration tool.',
    command: 'subfinder -d {{value}} -all -silent -timeout 30 -max-time 10',
    resultHandler: ({ result, job, dataSource }) => {
      const parsed = result.trim().split('\n');
      updateResultToDatabase(dataSource, job, parsed);
    },
  },
  {
    id: WorkerName.NAABU,
    description: 'Scan open ports and detect running services on each port.',
    command: '',
    resultHandler: ({ result }) => {
      return result.trim().split('\n');
    },
  },
  {
    id: WorkerName.DNSX,
    description:
      'Perform DNS resolution and enumeration to gather additional information about subdomains and their associated IP addresses.',
    command: '',
    resultHandler: ({ result }) => {
      return result.trim().split('\n');
    },
  },
];

function updateResultToDatabase(dataSource: DataSource, job: Job, result: any) {
  // Update parsed result to database
  dataSource
    .createQueryBuilder()
    .update(Job)
    .set({
      rawResult: result,
      status: JobStatus.COMPLETED,
      completedAt: new Date(),
    })
    .where('id = :id', { id: job.id })
    .execute();
}
