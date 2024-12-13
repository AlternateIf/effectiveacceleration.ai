import React, { useState } from 'react';
import JobsTable from './JobsTable';
import { TInProgressTable } from '@/service/JobsService';
import {
  useReactTable,
  getCoreRowModel,
  createColumnHelper,
} from '@tanstack/react-table';
import { columnBuilder } from '@/components/TablesCommon';
import { Job } from '@effectiveacceleration/contracts';
import Link from 'next/link';

const columnHelper = createColumnHelper<TInProgressTable>();
const columns = [
  columnBuilder(columnHelper, 'jobName', 'Job Name'),
  columnBuilder(columnHelper, 'assignedTo', 'Assigned to'),
  columnBuilder(columnHelper, 'tags', 'Progress'),
  columnBuilder(columnHelper, 'actions', 'Actions'),
];

export const WorkerApplicationsJobs = ({ jobs }: { jobs: Job[] }) => {
  const defaultData: TInProgressTable[] = jobs.map((job, index) => ({
    jobName: (
      <span
        data-url={`/dashboard/jobs/${job.id}`}
        key={index}
        className='font-bold'
      >
        {job.title}
      </span>
    ),
    assignedTo: (
      <span key={index} className='font-md'>
        {job.roles.worker ?? ''}
      </span>
    ),
    tags: job.tags.map((tag, index) => (
      <span
        key={index}
        className='rounded-full bg-[#E1FFEF] px-3 py-2 text-sm text-[#23B528]'
      >
        {tag}
      </span>
    )),
    actions: (
      <Link key={index} href={`/dashboard/jobs/${job.id?.toString()}`}>
        <span
          key={index}
          className='font-md font-semibold text-primary underline'
        >
          View Details
        </span>
      </Link>
    ),
  }));

  const [data, setData] = useState(() => defaultData);
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <JobsTable
      table={table}
      jobs={jobs}
      title='Job Aplications'
      emptyMessage='No job applications found'
      emptySubtext='Apply to more jobs to see them here'
    />
  );
};
