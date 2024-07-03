import { Button } from '@/components/Button'
import { Token } from '@/tokens';
import React, { ReactNode } from 'react'
import { JobFormInputData } from '@/service/FormsTypes';


interface JobSummaryProps {
  formInputs: JobFormInputData[];
  submitJob: () => void;
}

const JobSummary: React.FC<JobSummaryProps>  = ({formInputs, submitJob}) => {
  return (
    <div>
        <div className='mb-6'>
        <h1 className="text-3xl font-bold mb-1">Summary</h1>
        <span className='text-darkBlueFont'>Before you submit your form, check your answers.</span>
        </div>
        <div className='bg-white rounded-3xl p-8 shadow-md flex flex-col '>
        {formInputs.map((inputData, index) => (
            <div key={index} className='flex mb-8'>
            <div className='flex grow md:min-w-[14rem] md:max-w-[14rem]'>
                <span className='font-bold'>{inputData.label}</span>
            </div>
            <div className='flex grow-[2]'>
                <span className=''>{inputData.inputInfo}</span>
            </div>
            </div>
        )
        )}
        </div>
        <div className='flex justify-end mt-5'>
            <Button onClick={submitJob}>Submit</Button>
        </div>
    </div>
  )
}

export default JobSummary