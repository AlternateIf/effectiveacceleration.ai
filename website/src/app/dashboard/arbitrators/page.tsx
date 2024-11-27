'use client';

import { Layout } from '@/components/Dashboard/Layout';
import { Link } from '@/components/Link';
import {
  Pagination,
  PaginationGap,
  PaginationList,
  PaginationNext,
  PaginationPage,
  PaginationPrevious,
} from '@/components/Pagination';
import useArbitrators from '@/hooks/subsquid/useArbitrators';
import { ChevronRightIcon } from '@heroicons/react/20/solid';
import { clsx } from 'clsx';

export default function OpenJobsPage() {
  const { data: arbitrators } = useArbitrators();

  return (
    <Layout>
      <h1 className='mb-8 ml-2 text-xl font-medium'>Arbitrators</h1>
      {arbitrators?.map((arbitrator, idx) => (
        <li
          key={idx}
          className='relative flex items-center space-x-4 rounded-md px-2 py-4 transition ease-in-out hover:bg-zinc-50 dark:hover:bg-zinc-950'
        >
          <div className='min-w-0 flex-auto'>
            <div className='flex items-center gap-x-3'>
              <h2 className='min-w-0 text-sm font-semibold leading-6 text-black dark:text-white'>
                <Link
                  href={`/dashboard/arbitrators/${arbitrator.address_}`}
                  className='flex gap-x-2'
                >
                  <span className='truncate'>{arbitrator.name}</span>
                  <span className='text-gray-600 dark:text-gray-400'>/</span>
                  {/* <span className="whitespace-nowrap text-gray-500 dark:text-gray-500">{moment.duration(user.maxTime, "seconds").humanize()}</span> */}
                  <span className='absolute inset-0' />
                </Link>
              </h2>
            </div>
            <div className='mt-3 flex items-center gap-x-2.5 text-xs leading-5 text-gray-600 dark:text-gray-400'>
              {/* <p className="truncate">{user.roles.creator}</p> */}
              <svg
                viewBox='0 0 2 2'
                className='h-0.5 w-0.5 flex-none fill-gray-300'
              >
                <circle cx={1} cy={1} r={1} />
              </svg>
              <p className='whitespace-nowrap'>
                <span className='text-green-500 dark:text-green-400'>
                  +{arbitrator.refusedCount}
                </span>
                <span className='text-red-500 dark:text-red-400'>
                  -{arbitrator.refusedCount}
                </span>{' '}
                reputation
              </p>
            </div>
          </div>
          <div
            className={clsx(
              'flex-none rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset'
            )}
          >
            {arbitrator.bio.toString()}
          </div>
          <ChevronRightIcon
            className='h-5 w-5 flex-none text-gray-400'
            aria-hidden='true'
          />
        </li>
      ))}

      <Pagination className='mt-20'>
        <PaginationPrevious href='?page=2' />
        <PaginationList>
          <PaginationPage href='?page=1'>1</PaginationPage>
          <PaginationPage href='?page=2'>2</PaginationPage>
          <PaginationPage href='?page=3' current>
            3
          </PaginationPage>
          <PaginationPage href='?page=4'>4</PaginationPage>
          <PaginationGap />
          <PaginationPage href='?page=65'>65</PaginationPage>
          <PaginationPage href='?page=66'>66</PaginationPage>
        </PaginationList>
        <PaginationNext href='?page=4' />
      </Pagination>
    </Layout>
  );
}
