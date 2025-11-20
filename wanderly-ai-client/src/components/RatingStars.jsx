export default function RatingStars({ value }) {
  const num = Number(value);
  if (!num || Number.isNaN(num)) return null;

  const rounded = Math.round(num * 2) / 2; // to .5
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    if (i <= rounded) stars.push('★');
    else if (i - 0.5 === rounded) stars.push('☆');
    else stars.push('☆');
  }

  return (
    <span className="text-amber-500 text-sm ml-1">
      {stars.join('')}
    </span>
  );
}


