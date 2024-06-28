'use client'
import { Logo } from '@/components/Logo'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React, { Fragment } from 'react'

const SidebarMobile = ({sidebarOpen, setSidebarOpen, navigationItems} : {sidebarOpen: boolean, setSidebarOpen: (value: boolean) => void, navigationItems: { name: string; href: string; icon:  React.JSX.Element; }[]}) => {
const pathname = usePathname()
  return (
    <>
        <Transition.Root show={sidebarOpen} as={Fragment}>
            <Dialog as="div" className="relative z-50 lg:hidden" onClose={setSidebarOpen}>
                <Transition.Child
                    as={Fragment}
                    enter="transition-opacity ease-linear duration-150"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="transition-opacity ease-linear duration-150"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-gray-900/80" />
                </Transition.Child>

                <div className="fixed inset-0 flex">
                    <Transition.Child
                    as={Fragment}
                    enter="transition ease-in-out duration-150 transform"
                    enterFrom="-translate-x-full"
                    enterTo="translate-x-0"
                    leave="transition ease-in-out duration-150 transform"
                    leaveFrom="translate-x-0"
                    leaveTo="-translate-x-full"
                    >
                    <Dialog.Panel className="relative mr-16 flex w-full max-w-xs flex-1">
                        <Transition.Child
                        as={Fragment}
                        enter="ease-in-out duration-150"
                        enterFrom="opacity-0"
                        enterTo="opacity-100"
                        leave="ease-in-out duration-150"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                        >
                        <div className="absolute left-full top-0 flex w-16 justify-center pt-5">
                            <button type="button" className="-m-2.5 p-2.5" onClick={() => setSidebarOpen(false)}>
                            <span className="sr-only">Close sidebar</span>
                            <XMarkIcon className="h-6 w-6 text-white" aria-hidden="true" />
                            </button>
                        </div>
                        </Transition.Child>

                        <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-white dark:bg-black px-6 pb-4">
                        <div className="flex h-16 shrink-0 items-center">
                            <Logo className="h-8 w-auto" />
                        </div>
                        <nav className="flex flex-1 flex-col">
                            <ul role="list" className="flex flex-1 flex-col gap-y-7">
                            <li>
                                <ul role="list" className="-mx-2 space-y-1">
                                {navigationItems.map((item) => (
                                    <li key={item.name}>
                                    <Link
                                        href={item.href}
                                        className={clsx(
                                        pathname == item.href
                                            ? 'bg-opacity-40  bg-indigo-200 dark:bg-fuchsia-200  dark:text-slate-100'
                                            : 'text-white dark:text-slate-100 hover:bg-indigo-500/10 hover:dark:bg-fuchsia-500/10',
                                        'group flex gap-x-3 rounded-full p-2 text-sm leading-6 font-semibold'
                                        )}
                                    >
                                        <Link href={item.name} className={`flex p-3.5 align-center items-center gap-2.5 rounded-full ${pathname === item.href && 'bg-opacity-10 bg-white'}`}>
                                        {item.icon}
                                        {item.name}
                                        </Link>
                                        {/* <item.icon
                                        className={clsx(
                                            pathname == item.href ? navigationIconOnPageClasses : navigationIconOffPageClasses,
                                            'h-6 w-6 shrink-0'
                                        )}
                                        aria-hidden="true"
                                        /> */}
                                        {item.name}
                                    </Link>
                                    </li>
                                ))}
                                </ul>
                            </li>
                            </ul>
                        </nav>
                        </div>
                    </Dialog.Panel>
                    </Transition.Child>
                </div>
            </Dialog>
        </Transition.Root>
    </>
  )
}

export default SidebarMobile