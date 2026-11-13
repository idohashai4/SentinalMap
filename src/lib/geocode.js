export async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&accept-language=he,en`;
  const res = await fetch(url, { headers: { "Accept-Language": "he,en" } });
  const data = await res.json();
  return data?.display_name || null;
}

export async function geocodeLocation(locationName) {
  const query = encodeURIComponent(locationName + ", Israel");
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`;

  const res = await fetch(url, {
    headers: { "Accept-Language": "en" }
  });
  const data = await res.json();

  if (!data || data.length === 0) {
    // Try without ", Israel" suffix
    const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationName)}&limit=1`;
    const fallbackRes = await fetch(fallbackUrl, {
      headers: { "Accept-Language": "en" }
    });
    const fallbackData = await fallbackRes.json();

    if (!fallbackData || fallbackData.length === 0) {
      return null;
    }
    return {
      lat: parseFloat(fallbackData[0].lat),
      lng: parseFloat(fallbackData[0].lon)
    };
  }

  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon)
  };
}

