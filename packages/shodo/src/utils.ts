export function plain2Object(data) {
  const a = data.split('|')
  const header = a.shift()
  const [v, dpi, pv, w, h] = header.split(',')
  const sh = []

  a.forEach((d) => {
    const b = d.split(';')
    const O = b.shift()
    let D

    if (+O === 0) {
      D = []
      b.forEach((s) => {
        const [X, Y, T, P] = s.split(',')

        D.push({
          X: +X,
          Y: +Y,
          T: +T,
          P: +P,
        })
      })
    }
    else if (+O === 2) {
      D = b.shift()
    }
    else {
      D = +b.shift()
    }

    sh.push({
      O: +O,
      D,
    })
  })

  return {
    v,
    dpi: +dpi,
    pv: +pv,
    w: +w,
    h: +h,
    sh,
  }
}

export function object2Plain(data) {
  const { v, dpi, pv, w, h, sh } = data
  const result = [`${v},${dpi},${pv},${w},${h}`]

  sh.forEach(({ O, D }) => {
    const ds = [`${O}`]

    if (Array.isArray(D)) {
      D.forEach(({ X, Y, T }) => {
        ds.push(`${X.toFixed(2)},${Y.toFixed(2)},${T},${1}`)
      })
    }
    else {
      ds.push(D)
    }

    result.push(ds.join(';'))
  })

  return result.join('|')
}
