import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts'
import type { Point, Range } from '../lib/metrics'

// 圖表顏色來自 CSS token（styles.css 的 --series-*），淺色/深色各自驗證過
function readColors() {
  const cs = getComputedStyle(document.documentElement)
  const v = (name: string) => cs.getPropertyValue(name).trim()
  return { s1: v('--series-1'), s2: v('--series-2'), grid: v('--border'), axis: v('--muted'), surface: v('--card') }
}

function useChartColors() {
  const [colors, setColors] = useState(readColors)
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const update = () => setColors(readColors())
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return colors
}

interface Series {
  key: 'weight' | 'intake' | 'burned'
  name: string
  color: string
  dashed?: boolean
}

const fmt = (v: number) => v.toLocaleString('zh-TW', { maximumFractionDigits: 1 })

function ChartTooltip({ active, payload, label, unit, range }: TooltipProps<number, string> & { unit: string; range: Range }) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((p) => p.value != null)
  if (!rows.length) return null
  return (
    <div className="chart-tip">
      <div className="chart-tip-title">{range === 'year' ? `${label} 起的一週（平均）` : label}</div>
      {rows.map((p) => (
        <div key={p.dataKey as string} className="chart-tip-row">
          <span className="swatch" style={{ background: p.color }} aria-hidden />
          <span>{p.name}</span>
          <strong>
            {fmt(p.value as number)} {unit}
          </strong>
        </div>
      ))}
    </div>
  )
}

function Chart({ title, unit, points, series, range, empty }: { title: string; unit: string; points: Point[]; series: Series[]; range: Range; empty: string }) {
  const c = useChartColors()
  const values = points.flatMap((p) => series.flatMap((s) => (p[s.key] != null ? [p[s.key] as number] : [])))
  // 體重的變化很小，Y 軸不從 0 開始才看得出趨勢；卡路里從 0 開始
  const domain = useMemo<[number, number] | undefined>(() => {
    if (!values.length || series[0].key !== 'weight') return undefined
    return [Math.floor(Math.min(...values) - 0.5), Math.ceil(Math.max(...values) + 0.5)]
  }, [values, series])

  return (
    <figure className="chart-card">
      <figcaption className="chart-head">
        <h3>
          {title} <span className="muted small">（{unit}）</span>
        </h3>
        {series.length > 1 && (
          <ul className="legend" aria-label="圖例">
            {series.map((s) => (
              <li key={s.key}>
                <svg width="20" height="8" aria-hidden>
                  <line x1="0" y1="4" x2="20" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? '4 3' : undefined} />
                </svg>
                {s.name}
              </li>
            ))}
          </ul>
        )}
      </figcaption>
      {values.length === 0 ? (
        <p className="chart-empty muted small">{empty}</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: c.axis, fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: c.grid }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              domain={domain ?? [0, 'auto']}
              tick={{ fill: c.axis, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={fmt}
            />
            <Tooltip
              content={<ChartTooltip unit={unit} range={range} />}
              cursor={{ stroke: c.axis, strokeWidth: 1 }}
              isAnimationActive={false}
            />
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.dashed ? '4 3' : undefined}
                dot={{ r: range === 'year' ? 3 : 4, fill: s.color, stroke: c.surface, strokeWidth: 2 }}
                activeDot={{ r: 5, fill: s.color, stroke: c.surface, strokeWidth: 2 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </figure>
  )
}

export function TrendCharts({ points, range }: { points: Point[]; range: Range }) {
  const c = useChartColors()
  const [showTable, setShowTable] = useState(false)
  const rows = points.filter((p) => p.weight != null || p.intake != null || p.burned != null)
  return (
    <>
      <Chart
        title="體重"
        unit="kg"
        points={points}
        range={range}
        series={[{ key: 'weight', name: '體重', color: c.s1 }]}
        empty="這段期間沒有體重記錄"
      />
      <Chart
        title="卡路里"
        unit="kcal"
        points={points}
        range={range}
        series={[
          { key: 'intake', name: '攝取', color: c.s1 },
          { key: 'burned', name: '運動消耗', color: c.s2, dashed: true },
        ]}
        empty="這段期間沒有卡路里或運動記錄"
      />
      {rows.length > 0 && (
        <details className="table-view" open={showTable} onToggle={(e) => setShowTable(e.currentTarget.open)}>
          <summary>以表格檢視{range === 'year' ? '（每週平均）' : ''}</summary>
          {showTable && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{range === 'year' ? '週' : '日期'}</th>
                    <th scope="col">體重 kg</th>
                    <th scope="col">攝取 kcal</th>
                    <th scope="col">消耗 kcal</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.date}>
                      <th scope="row">{p.date}</th>
                      <td>{p.weight != null ? fmt(p.weight) : '—'}</td>
                      <td>{p.intake != null ? fmt(p.intake) : '—'}</td>
                      <td>{p.burned != null ? fmt(p.burned) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      )}
    </>
  )
}
