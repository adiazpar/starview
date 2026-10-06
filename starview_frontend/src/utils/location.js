export function validCoordinates(data) {
  return Number.isFinite(data?.latitude) && Number.isFinite(data?.longitude)
    && Math.abs(data.latitude) <= 90 && Math.abs(data.longitude) <= 180;
}
