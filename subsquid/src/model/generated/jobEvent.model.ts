import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, IntColumn as IntColumn_, ManyToOne as ManyToOne_, Index as Index_, StringColumn as StringColumn_} from "@subsquid/typeorm-store"
import * as marshal from "./marshal"
import {Job} from "./job.model"
import {CustomJobEvent, fromJsonCustomJobEvent} from "./_customJobEvent"

@Entity_()
export class JobEvent {
    constructor(props?: Partial<JobEvent>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @IntColumn_({nullable: false})
    jobId!: number

    @Index_()
    @ManyToOne_(() => Job, {nullable: true})
    job!: Job

    @IntColumn_({nullable: false})
    type!: number

    @StringColumn_({nullable: false})
    address!: string

    @StringColumn_({nullable: false})
    data!: string

    @IntColumn_({nullable: false})
    timestamp!: number

    @Column_("jsonb", {transformer: {to: obj => obj == null ? undefined : obj.toJSON(), from: obj => obj == null ? undefined : fromJsonCustomJobEvent(obj)}, nullable: true})
    details!: CustomJobEvent | undefined | null
}
