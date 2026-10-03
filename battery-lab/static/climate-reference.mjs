export function monthlyReference(data,region,month){
  const place=data.places.find(p=>p.id===region);
  if(!place||!Number.isInteger(month)||month<1||month>12)return null;
  return {place,...place.months[month-1]};
}
