import { type EventProps } from './index';
import moment from 'moment';
import { JobSignedEvent } from 'effectiveacceleration-contracts';
import { getAddress } from 'viem';
import useUser from '@/hooks/useUser';
import EventProfileImage from './Components/EventProfileImage';

export function SignedEvent({event, ...rest}: EventProps & React.ComponentPropsWithoutRef<'div'>) {
  const address = getAddress(event.address_);
  const href = `/dashboard/users/${address}`;
  const {data: user} = useUser(address);
  const date = moment(event.timestamp_ * 1000).fromNow()
  const details = event.details! as JobSignedEvent;

  return (
    <>
      <div className="relative">
        {user && <EventProfileImage user={user} />}
      </div>
      <div className="min-w-0 flex-1 py-1.5">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          <a href={href} className="font-medium text-gray-900 dark:text-gray-100">
            {user?.name}
          </a>{' '}
          signed the job at revision {details.revision}{' '}{' '}
          <span className="whitespace-nowrap">{date}</span>
        </div>
      </div>
    </>
  )
}