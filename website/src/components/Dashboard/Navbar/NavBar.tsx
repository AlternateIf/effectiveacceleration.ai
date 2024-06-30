'use client'
import BreadCrumbs from '@/components/BreadCrumbs'
import { Bars3Icon, BellIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React, { useEffect, useState } from 'react'
import { FaArrowRight } from 'react-icons/fa6'
import { GoPerson } from 'react-icons/go'
import { MdOutlineArrowForwardIos } from 'react-icons/md'
import { PiBellSimple } from 'react-icons/pi'
import { useAccount, useReadContract } from 'wagmi'

const Navbar = ({setSidebarOpen} : {setSidebarOpen: (value: boolean) => void}) => {
    const { address } = useAccount();
    const [notificationsCount, setNotificationsCount] = useState(BigInt(0))
    const pathname = usePathname();
    const { data: notificationsLengthData } = useReadContract({
        account:      address,
        // abi:          MarketplaceArtifact.abi,
        // address: Config.marketplaceAddress as `0x${string}`,
        address:      `0x6EAdb61bce217A9FBA5A1d91427ae2F7A8CCBac6`,
        functionName: 'notificationsLength',
        args:         [address],
      });
    
      useEffect(() => {
        if (notificationsLengthData) {
          setNotificationsCount(notificationsLengthData as bigint)
        }
      }, [notificationsLengthData])
  return (
    <>
        {/* <div className='border-b border-gray-200 dark:border-gray-900'> */}
          <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 bg-white/80 dark:bg-black/80 backdrop-blur-lg px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
            <button type="button" className="-m-2.5 p-2.5 text-gray-700 lg:hidden" onClick={() => setSidebarOpen(true)}>
              <span className="sr-only">Open sidebar</span>
              <Bars3Icon className="h-6 w-6" aria-hidden="true" />
            </button>

            {/* Separator */}
            <div className="h-6 w-px bg-gray-900/10 lg:hidden" aria-hidden="true" />

            <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
              <div className="relative flex flex-1 items-center" >
                <BreadCrumbs           
                  separator={<MdOutlineArrowForwardIos className='self-center text-gray-200'/>}
                  activeClasses='text-primary'
                  containerClasses='flex'
                  listClasses='hover:underline mx-2 font-bold'
                  capitalizeLinks       
                />
              </div>
              <div className="flex items-center gap-x-4 lg:gap-x-3">
                <Link href="/notifications" className="-m-2.5 p-2.5 text-gray-400 hover:text-gray-500">
                  <span className="sr-only">View notifications</span>
                  <span className="relative">
                    {notificationsCount > 0 && (
                      <span className="absolute -top-2 -right-2 h-4 w-4 rounded-full text-xs text-white bg-red-400 flex justify-center items-center">
                        {notificationsCount.toString()}
                      </span>
                    )}
                    {/* <BellIcon className="h-6 w-6" aria-hidden="true" /> */}
                  </span>
                </Link>

                <Link href={'/dashboard/post-job'} className='flex text-white items-center justify-center p-2 rounded-full bg-primary gap-2 w-36'>
                    <GoPerson className='text-xl '/>
                    <span className='text-sm h-6 flex items-center'>Create Job</span>
                    <FaArrowRight className='text-lg ' />
                </Link>
                <button className='p-2 bg-gray-200 rounded-full'>
                <PiBellSimple className='text-2xl ' />  
                </button>
                <button className='p-2 bg-primary rounded-full'>
                  <span className='text-white inline-block w-6 h-6'>R</span>
                </button>
                {/* <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-gray-900/10" aria-hidden="true" /> */}
                {/* <ConnectButton /> */}
              </div>
            </div>
          </div>
    </>
  )
}

export default Navbar