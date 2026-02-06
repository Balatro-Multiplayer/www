import { RatingDistributionChart } from './_components/rating-distribution-chart'

export default function RatingDistributionPage() {
  return (
    <div className='container mx-auto py-8'>
      <h1 className='mb-6 text-3xl font-bold'>Rating Distribution</h1>
      <RatingDistributionChart />
    </div>
  )
}
