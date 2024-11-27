import { AddToHomescreen } from '@/components/AddToHomescreen';
import { Layout } from '@/components/Dashboard/Layout';
import React from 'react';
import { OpenJobsFeed } from '@/components/Dashboard/JobsTables/OpenJobsFeed';

export default function OpenJobListPage() {
  return (
    <Layout>
      <OpenJobsFeed />
      <AddToHomescreen />
    </Layout>
  );
}
