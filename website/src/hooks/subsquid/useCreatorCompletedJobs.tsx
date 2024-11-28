import { Job } from '@effectiveacceleration/contracts';
import { useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { GET_CREATOR_COMPLETED_JOBS } from './queries';

export default function useCreatorCompletedJobs(creatorAddress: string) {
  const { data, ...rest } = useQuery(GET_CREATOR_COMPLETED_JOBS, {
    variables: { creatorAddress },
  });

  return useMemo(
    () => ({ data: data ? (data?.jobs as Job[]) : undefined, ...rest }),
    [data, rest]
  );
}
