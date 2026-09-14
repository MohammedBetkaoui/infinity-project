import InfinityMark from './InfinityMark'

export default function InfinityArtwork() {
  return (
    <div className="home-hero-art" aria-hidden="true">
      <div className="home-hero-mark-depth">
        <div className="home-hero-mark"><InfinityMark /></div>
      </div>
      <span className="home-hero-spark home-hero-spark-one" />
      <span className="home-hero-spark home-hero-spark-two" />
      <span className="home-hero-spark home-hero-spark-three" />
      <span className="home-hero-spark home-hero-spark-four" />
    </div>
  )
}
