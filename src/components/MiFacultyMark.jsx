// Official MI lockup (monogram + faculty wordmark, no divider), geometry copied
// 1:1 from public/assets/mi-logo.html. Colour is never baked in: every shape
// uses currentColor so callers control it via CSS (e.g. #d2d2d2 in footers).
// `lockup` renders the full artwork; default renders the monogram alone for
// tight spaces (matching InfinityMark usage).
export default function MiFacultyMark({ className = '', lockup = false, title = 'Faculty of Mathematics and Computer Science' }) {
  if (lockup) {
    return (
      <svg
        className={`mi-faculty-mark mi-faculty-lockup ${className}`}
        viewBox="0 0 3520 825.4"
        fill="currentColor"
        role="img"
        aria-label={title}
        focusable="false"
        style={{ overflow: 'visible' }}
      >
        <polygon points="654.38 676.16 654.38 693.06 652 693.06 552.03 693.06 523.6 693.06 508.74 693.06 508.74 257.04 344.3 300.89 343.66 301.04 343.66 693.06 198.02 693.06 198.02 237.09 198.02 101.1 198.02 100.79 208.01 85.21 363.1 156.87 450.23 197.14 639.8 284.84 643.93 286.79 674.84 301.04 800.58 359.07 654.38 388.82 654.38 669.54 654.38 669.77 654.38 676.16" />
        <polygon points="800.58 359.07 674.84 301.04 643.93 286.79 639.8 284.84 450.23 197.14 800.58 359.07" />
        <path d="M699.23,693.06H654.39v-16.9l2.65.93a27.36,27.36,0,0,0,11.29,8.49C677.77,689.55,688.5,691.81,699.23,693.06Z" />
        <polygon points="508.74 257.04 505.44 257.97 344.3 300.89 508.74 257.04" />
        <polygon points="208.01 85.21 198.02 100.79 195.54 101.57 23.76 156.25 23.76 137.86 23.76 0 208.01 85.21" />
        <polygon stroke="currentColor" strokeMiterlimit="10" strokeWidth="0.5" points="79.13 236.4 76.48 318.18 0.54 262.33 79.13 236.4" />
        <polygon points="422.41 377.37 422.41 678.78 387.6 677.95 386.58 675.93 386.04 351.63 388.61 351.63 422.41 377.37" />
        <text
          transform="translate(997.69 389.79)"
          fontSize="170"
          fontFamily="OpenSauceOne-Regular, 'Open Sauce One', Georgia, 'Times New Roman', serif"
          fill="currentColor"
        >
          FACULTY OF MATHEMATICS
        </text>
        <text
          transform="translate(1000.52 556.59)"
          fontSize="170"
          fontFamily="OpenSauceOne-Regular, 'Open Sauce One', Georgia, 'Times New Roman', serif"
          fill="currentColor"
        >
          &amp; COMPUTER SCIENCE
        </text>
      </svg>
    )
  }

  return (
    <svg className={`mi-faculty-mark ${className}`} viewBox="0 0 801 694" fill="currentColor" aria-hidden="true" focusable="false">
      <polygon points="654.38 676.16 654.38 693.06 652 693.06 552.03 693.06 523.6 693.06 508.74 693.06 508.74 257.04 344.3 300.89 343.66 301.04 343.66 693.06 198.02 693.06 198.02 237.09 198.02 101.1 198.02 100.79 208.01 85.21 363.1 156.87 450.23 197.14 639.8 284.84 643.93 286.79 674.84 301.04 800.58 359.07 654.38 388.82 654.38 669.54 654.38 669.77 654.38 676.16" />
      <polygon points="800.58 359.07 674.84 301.04 643.93 286.79 639.8 284.84 450.23 197.14 800.58 359.07" />
      <path d="M699.23,693.06H654.39v-16.9l2.65.93a27.36,27.36,0,0,0,11.29,8.49C677.77,689.55,688.5,691.81,699.23,693.06Z" />
      <polygon points="508.74 257.04 505.44 257.97 344.3 300.89 508.74 257.04" />
      <polygon points="208.01 85.21 198.02 100.79 195.54 101.57 23.76 156.25 23.76 137.86 23.76 0 208.01 85.21" />
      <polygon stroke="#000" strokeMiterlimit="10" strokeWidth="0.5" points="79.13 236.4 76.48 318.18 0.54 262.33 79.13 236.4" />
      <polygon points="422.41 377.37 422.41 678.78 387.6 677.95 386.58 675.93 386.04 351.63 388.61 351.63 422.41 377.37" />
    </svg>
  )
}
