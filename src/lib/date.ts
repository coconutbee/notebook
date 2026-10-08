const pad = (n: number) => String(n).padStart(2, '0')

/** 本地時區的 YYYY-MM-DD */
export const toDateStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const nowIso = () => new Date().toISOString()

export const monthLabel = (ym: string) => (ym ? `${ym.slice(0, 4)} 年 ${Number(ym.slice(5, 7))} 月` : '未標日期')
