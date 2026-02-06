'use client'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { api } from '@/trpc/react'
import { format } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

const chartConfig = {
  count: {
    label: 'Games',
    color: 'var(--color-violet-500)',
  },
} satisfies ChartConfig

type GroupByOption = 'hour' | 'day' | 'week' | 'month'

export function GamesPerHourChart() {
  const [groupBy, setGroupBy] = useState<GroupByOption>('hour')
  const [dateRange, setDateRange] = useState<
    | {
        from?: Date | undefined
        to?: Date | undefined
      }
    | undefined
  >({
    from: undefined,
    to: undefined,
  })

  // Fetch games data with the selected grouping and date range
  const [gamesData] = api.history.games_per_hour.useSuspenseQuery({
    groupBy,
    startDate: dateRange?.from?.toISOString(),
    endDate: dateRange?.to?.toISOString(),
  })

  // Format the title and description based on the grouping
  const getTitleText = () => {
    switch (groupBy) {
      case 'hour':
        return 'Games Played Per Hour'
      case 'day':
        return 'Games Played Per Day'
      case 'week':
        return 'Games Played Per Week'
      case 'month':
        return 'Games Played Per Month'
      default:
        return 'Games Played'
    }
  }

  // Format the X-axis labels based on the grouping
  const formatXAxisTick = (value: string) => {
    const date = new Date(value)

    switch (groupBy) {
      case 'hour':
        return `${date.toLocaleDateString()} ${date.getHours()}:00`
      case 'day':
        return date.toLocaleDateString()
      case 'week':
        return value // Already formatted as "Week of YYYY-MM-DD"
      case 'month':
        return `${date.toLocaleString('default', { month: 'long' })} ${date.getFullYear()}`
      default:
        return value
    }
  }

  return (
    <Card className='w-full'>
      <CardHeader className='flex flex-row items-center justify-between'>
        <div>
          <CardTitle>{getTitleText()}</CardTitle>
          <CardDescription>Number of games played over time</CardDescription>
        </div>
        <div className='flex gap-2'>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id='date'
                variant={'outline'}
                className={cn(
                  'w-[280px] justify-start text-left font-normal',
                  !dateRange?.from && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className='mr-2 h-4 w-4' />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, 'LLL dd, y')} -{' '}
                      {format(dateRange.to, 'LLL dd, y')}
                    </>
                  ) : (
                    format(dateRange.from, 'LLL dd, y')
                  )
                ) : (
                  <span>Pick a date range</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className='w-auto p-0' align='end'>
              <Calendar
                initialFocus
                mode='range'
                defaultMonth={dateRange?.from}
                selected={{
                  from: dateRange?.from,
                  to: dateRange?.to,
                }}
                onSelect={setDateRange}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>

          <Select
            value={groupBy}
            onValueChange={(value) => setGroupBy(value as GroupByOption)}
          >
            <SelectTrigger className='w-[180px]'>
              <SelectValue placeholder='Select grouping' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='hour'>Group by Hour</SelectItem>
              <SelectItem value='day'>Group by Day</SelectItem>
              <SelectItem value='week'>Group by Week</SelectItem>
              <SelectItem value='month'>Group by Month</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className='h-[500px] w-full p-2'>
        <ChartContainer config={chartConfig} className='h-full w-full'>
          <BarChart
            data={gamesData}
            margin={{
              top: 20,
              right: 30,
              left: 20,
              bottom: 60,
            }}
          >
            <CartesianGrid strokeDasharray='3 3' />
            <XAxis
              dataKey='timeUnit'
              angle={-45}
              textAnchor='end'
              height={60}
              tickFormatter={formatXAxisTick}
            />
            <YAxis />
            <ChartTooltip
              content={
                <ChartTooltipContent formatter={(value) => `${value} games`} />
              }
            />
            <Bar dataKey='count' fill='var(--color-count)' />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
