import { Job } from '@effectiveacceleration/contracts';
import { useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { GET_CREATOR_COMPLETED_JOBS } from './queries';
import { OrderByType } from '@/service/Interfaces';

export default function useCreatorCompletedJobs(
  creatorAddress: string,
  orderBy?: OrderByType
) {
  const { data, ...rest } = useQuery(GET_CREATOR_COMPLETED_JOBS, {
    variables: { creatorAddress, ...(orderBy && { orderBy }) },
  });

  return useMemo(
    () => ({ data: data ? (data?.jobs as Job[]) : undefined, ...rest }),
    [data, rest]
  );
}
