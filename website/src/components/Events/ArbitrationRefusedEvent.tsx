import {
  ChatBubbleLeftEllipsisIcon,
} from '@heroicons/react/20/solid'
import { type EventProps } from './index';
import moment from 'moment';
import { JobMessageEvent } from 'effectiveacceleration-contracts';

export function ArbitrationRefusedEvent({event, ...rest}: EventProps & React.ComponentPropsWithoutRef<'div'>) {
  const date = moment(event.timestamp_ * 1000).fromNow()
  const prevWorker = event.diffs.find(val => val.field === "roles.arbitrator")?.oldValue as string;
  const person = { name: prevWorker, href: '#' };
  const imageUrl =
    'https://images.unsplash.com/photo-1520785643438-5bf77931f493?ixlib=rb-=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=8&w=256&h=256&q=80';

  return (
    <>
      <div className="relative">
        <img
          className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-400 ring-8 ring-white"
          src={imageUrl}
          alt=""
        />
      </div>
      <div className="min-w-0 flex-1">
        <div>
          <div className="text-sm">
            <a href={person.href} className="font-medium text-gray-900 dark:text-gray-100">
              {person.name}
            </a>
          </div>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">refused the arbitration {date}</p>
        </div>
      </div>
    </>
  )
}