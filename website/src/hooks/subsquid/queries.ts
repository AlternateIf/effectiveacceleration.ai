import { gql } from "@apollo/client";
import { ArbitratorFields, JobEventFields, JobFields, MarketplaceFields, ReviewFields, UserFields } from "./fields";

export const GET_MARKETPLACES = gql`
  query GetMarketplaces {
    marketplaces {
      ${MarketplaceFields}
    }
  }
`;

export const GET_ARBITRATORS = gql`
  query GetArbitrators($offset: Int!, $limit: Int!) {
    arbitrators(orderBy: timestamp_ASC, offset: $offset, limit: $limit) {
      ${ArbitratorFields}
    }
  }
`;

export const GET_ARBITRATOR_BY_ADDRESS = gql`
  query GetArbitrator($arbitratorAddress: String!) {
    arbitrators(where: { address__eq: $arbitratorAddress }) {
      ${ArbitratorFields}
    }
  }
`;

export const GET_ARBITRATORS_BY_ADDRESSES = gql`
  query GetArbitrators($arbitratorAddresses: [String!]) {
    arbitrators(where: { address__in: $arbitratorAddresses }) {
      ${ArbitratorFields}
    }
  }
`;

export const GET_ARBITRATOR_PUBLIC_KEYS = gql`
  query GetArbitratorPublicKeys($arbitratorAddresses: [String!]) {
    arbitrators(where: { address__in: $arbitratorAddresses }) {
      address_
      publicKey
    }
  }
`;

export const GET_JOB_BY_ID = gql`
  query GetJob($jobId: String!) {
    jobs(where: { id_eq: $jobId }) {
      ${JobFields}
    }
  }
`;

export const GET_JOBS_BY_IDS = gql`
  query GetJobs($jobIds: [String!]) {
    jobs(orderBy: timestamp_ASC, where: { id_in: $jobIds }) {
      ${JobFields}
    }
  }
`;

export const GET_JOBS = gql`
  query GetJobs($offset: Int!, $limit: Int!) {
    jobs(orderBy: timestamp_ASC, offset: $offset, limit: $limit) {
      ${JobFields}
    }
  }
`;

export const GET_OPEN_JOBS = gql`
  query GetJobs($jobId: String!, $offset: Int!, $limit: Int!) {
    jobs(orderBy: timestamp_ASC, offset: $offset, limit: $limit, where: { state_eq: 0 }) {
      ${JobFields}
    }
  }
`;

export const GET_USERS = gql`
  query GetUsers($offset: Int!, $limit: Int!) {
    users(orderBy: timestamp_ASC, offset: $offset, limit: $limit) {
      ${UserFields}
    }
  }
`;


export const GET_USER_BY_ADDRESS = gql`
  query GetUser($userAddress: String!) {
    users(where: { address__eq: $userAddress }) {
      ${UserFields}
    }
  }
`;

export const GET_USERS_BY_ADDRESSES = gql`
  query GetUsersByAddresses($userAddresses: [String!]) {
    users(where: { address__in: $userAddresses }) {
      ${UserFields}
    }
  }
`;

export const GET_REVIEWS = gql`
  query GetReviews($targetAddress: String!, $offset: Int!, $limit: Int!) {
    reviews(orderBy: timestamp_ASC, where: { user_eq: $targetAddress }, offset: $offset, limit: $limit) {
      ${ReviewFields}
    }
  }
`;

export const GET_JOB_EVENTS = gql`
  query GetJobEvents($jobId: BigInt!) {
    jobEvents(orderBy: timestamp__ASC, where: { jobId_eq: $jobId }) {
      ${JobEventFields}
    }
  }
`;

export const GET_CREATOR_OPEN_JOBS = gql`
  query GetCreatorOpenJobs($creatorAddress: String!) {
    jobs(where: {roles:{creator_eq: $creatorAddress}, state_eq: 0}){
      ${JobFields}
    }
  }
`;

export const GET_CREATOR_TAKEN_JOBS = gql`
  query GetCreatorTakenJobs($creatorAddress: String!) {
    jobs(where: {roles:{creator_eq: $creatorAddress}, state_eq: 1}){
      ${JobFields}
    }
  }
`;

export const GET_CREATOR_COMPLETED_JOBS = gql`
  query GetCreatorCompletedJobs($creatorAddress: String!) {
    jobs(where: {roles:{creator_eq: $creatorAddress}, state_eq: 2, lastJobEvent:{type__in:[5,9,12]}}){
      ${JobFields}
    }
  }
`;

export const GET_CREATOR_DISPUTED_JOBS = gql`
  query GetCreatorDisputedJobs($creatorAddress: String!) {
    jobs(where: {roles:{creator_eq: $creatorAddress}, state_eq: 1, disputed_eq: true}){
      ${JobFields}
    }
  }
`;

export const GET_CREATOR_CLOSED_JOBS = gql`
  query GetCreatorDisputedJobs($creatorAddress: String!) {
    jobs(where: {roles:{creator_eq: $creatorAddress}, state_eq: 2, lastJobEvent:{type__eq:7}}){
      ${JobFields}
    }
  }
`;

export const GET_JOB_SEARCH = (search: string) => gql`
  query GetWorkerOpenJobSearch {
    jobs(where: {
      ${search}
    }) {
      ${JobFields}
    }
  }
`;

export const GET_WORKER_APPLICATIONS = gql`
  query GetWorkerApplications($workerAddress: String!) {
  jobs(where: {OR: [
    {roles: {worker_eq: $workerAddress}},
    {events_some: {OR:
      [
        {address__eq: $workerAddress},
        {details:{recipientAddress_eq: $workerAddress}},
        {details:{workerAddress_eq: $workerAddress}}
      ]
    }}
  ]}) {
      ${JobFields}
    }
  }
`;

export const GET_WORKER_TAKEN_JOBS = gql`
  query GetWorkerTakenJobs($workerAddress: String!) {
    jobs(where: {roles:{worker_eq: $workerAddress}, state_eq: 1}){
      ${JobFields}
    }
  }
`;

export const GET_WORKER_COMPLETED_JOBS = gql`
  query GetWorkerCompletedJobs($workerAddress: String!) {
    jobs(where: {roles:{worker_eq: $workerAddress}, state_eq: 2, lastJobEvent:{type__in:[5,9,12]}}){
      ${JobFields}
    }
  }
`;

export const GET_WORKER_DISPUTED_JOBS = gql`
  query GetCWorkerDisputedJobs($worker: String!) {
    jobs(where: {roles:{worker_eq: $worker}, state_eq: 1, disputed_eq: true}){
      ${JobFields}
    }
  }
`;