// Google My Business Reviews Integration
// Fetches real reviews from Google and displays them on the testimonials section

const GOOGLE_API_KEY = 'AIzaSyAN8TZL-pbR-VRbgvjwVnjLJf9-SOGJABo';
const PLACE_ID = 'ChIJYourPlaceIDHere'; // Update this with your actual Place ID

async function fetchGoogleReviews() {
  // Skip if Place ID is not configured yet
  if (PLACE_ID === 'ChIJYourPlaceIDHere') {
    console.log('Google Place ID not configured yet. Using default testimonials.');
    return;
  }

  try {
    const response = await fetch(`/api/google-reviews`);

    if (!response.ok) {
      console.log('Google reviews API not available. Using default testimonials.');
      return;
    }

    const data = await response.json();

    if (data.result && data.result.reviews && data.result.reviews.length > 0) {
      displayReviews(data.result.reviews);
    } else {
      console.log('No reviews found. Using default testimonials.');
    }
  } catch (error) {
    console.error('Error fetching Google reviews:', error);
    // Keep existing testimonials if API fails
  }
}

function displayReviews(reviews) {
  const testimonialsGrid = document.querySelector('.testimonials-grid');

  if (!testimonialsGrid) return;

  // Clear existing testimonials
  testimonialsGrid.innerHTML = '';

  // Display top 3-6 reviews (filter out low ratings)
  const topReviews = reviews
    .filter(review => review.rating >= 4) // Only 4-5 star reviews
    .sort((a, b) => b.rating - a.rating) // Sort by rating
    .slice(0, 6); // Take top 6

  topReviews.forEach(review => {
    const card = createReviewCard(review);
    testimonialsGrid.appendChild(card);
  });
}

function createReviewCard(review) {
  const card = document.createElement('div');
  card.className = 'testimonial-card';

  // Create stars
  const stars = document.createElement('div');
  stars.className = 'stars';
  for (let i = 0; i < 5; i++) {
    const star = document.createElement('i');
    star.className = i < review.rating ? 'fas fa-star' : 'far fa-star';
    stars.appendChild(star);
  }

  // Create review text
  const text = document.createElement('p');
  text.className = 'testimonial-text';
  text.textContent = `"${review.text}"`;

  // Create author section
  const author = document.createElement('div');
  author.className = 'testimonial-author';

  // Avatar with initials
  const avatar = document.createElement('div');
  avatar.className = 'author-avatar';
  const initials = review.author_name
    .split(' ')
    .map(n => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
  avatar.textContent = initials;

  // Author info
  const authorInfo = document.createElement('div');
  authorInfo.className = 'author-info';

  const authorName = document.createElement('h4');
  authorName.textContent = review.author_name;

  const timeAgo = document.createElement('p');
  timeAgo.textContent = review.relative_time_description || 'Google Review';

  authorInfo.appendChild(authorName);
  authorInfo.appendChild(timeAgo);

  author.appendChild(avatar);
  author.appendChild(authorInfo);

  // Assemble card
  card.appendChild(stars);
  card.appendChild(text);
  card.appendChild(author);

  return card;
}

// Load reviews when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', fetchGoogleReviews);
} else {
  fetchGoogleReviews();
}
