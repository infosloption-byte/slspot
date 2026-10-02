type SkeletonProps = {
  width?: string
  height?: string
  radius?: string
}

export function Skeleton({ width = '100%', height = '16px', radius = '8px' }: SkeletonProps) {
  return <span className="skeleton" style={{ width, height, borderRadius: radius }} aria-hidden="true" />
}
