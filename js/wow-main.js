// TownRanker WOW JavaScript - Premium Interactions & Animations

// Loader
window.addEventListener('load', () => {
    setTimeout(() => {
        document.getElementById('loader').classList.add('fade-out');
        initAnimations();
        startCounters();
        showNotifications();
    }, 1500);
});

// Initialize GSAP Animations
function initAnimations() {
    // Hero text animation
    gsap.timeline()
        .from('.hero-title span', {
            y: 100,
            opacity: 0,
            duration: 1,
            stagger: 0.5,
            ease: 'power4.out'
        })
        .from('.hero-subtitle', {
            y: 30,
            opacity: 0,
            duration: 0.8,
            ease: 'power3.out'
        }, '-=0.5')
        .from('.hero-cta', {
            y: 30,
            opacity: 0,
            duration: 0.8,
            ease: 'power3.out'
        }, '-=0.5');

    // Floating cards animation
    document.querySelectorAll('.floating-card').forEach((card, index) => {
        card.style.setProperty('--delay', `${index * 0.2}s`);
    });

    // Parallax effect on scroll
    gsap.to('.gradient-bg', {
        yPercent: -50,
        ease: 'none',
        scrollTrigger: {
            trigger: '.hero',
            start: 'top top',
            end: 'bottom top',
            scrub: true
        }
    });

    // Service cards entrance
    gsap.from('.service-card', {
        scrollTrigger: {
            trigger: '.services',
            start: 'top 80%'
        },
        y: 50,
        opacity: 0,
        duration: 0.8,
        stagger: 0.2,
        ease: 'power3.out'
    });

    // Portfolio items entrance
    gsap.from('.portfolio-item', {
        scrollTrigger: {
            trigger: '.portfolio',
            start: 'top 80%'
        },
        scale: 0.8,
        opacity: 0,
        duration: 0.8,
        stagger: 0.2,
        ease: 'power3.out'
    });
}

// Particle Animation
if (typeof particlesJS !== 'undefined') {
    particlesJS('particle-canvas', {
        particles: {
            number: {
                value: 80,
                density: {
                    enable: true,
                    value_area: 800
                }
            },
            color: {
                value: '#6366f1'
            },
            shape: {
                type: 'circle'
            },
            opacity: {
                value: 0.5,
                random: true,
                anim: {
                    enable: true,
                    speed: 1,
                    opacity_min: 0.1,
                    sync: false
                }
            },
            size: {
                value: 3,
                random: true,
                anim: {
                    enable: true,
                    speed: 2,
                    size_min: 0.1,
                    sync: false
                }
            },
            line_linked: {
                enable: true,
                distance: 150,
                color: '#6366f1',
                opacity: 0.2,
                width: 1
            },
            move: {
                enable: true,
                speed: 1,
                direction: 'none',
                random: false,
                straight: false,
                out_mode: 'out',
                bounce: false,
                attract: {
                    enable: false,
                    rotateX: 600,
                    rotateY: 1200
                }
            }
        },
        interactivity: {
            detect_on: 'canvas',
            events: {
                onhover: {
                    enable: true,
                    mode: 'grab'
                },
                onclick: {
                    enable: true,
                    mode: 'push'
                },
                resize: true
            },
            modes: {
                grab: {
                    distance: 140,
                    line_linked: {
                        opacity: 1
                    }
                },
                push: {
                    particles_nb: 4
                }
            }
        },
        retina_detect: true
    });
}

// Counter Animation
function startCounters() {
    const counters = document.querySelectorAll('.counter');
    const options = {
        threshold: 0.5
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const counter = entry.target;
                const target = parseFloat(counter.getAttribute('data-target'));
                const decimal = counter.getAttribute('data-decimal') || 0;
                const duration = 2000;
                const increment = target / (duration / 16);
                let current = 0;

                const updateCounter = () => {
                    current += increment;
                    if (current < target) {
                        counter.textContent = decimal > 0 ? current.toFixed(decimal) : Math.floor(current);
                        requestAnimationFrame(updateCounter);
                    } else {
                        counter.textContent = decimal > 0 ? target.toFixed(decimal) : target;
                    }
                };

                updateCounter();
                observer.unobserve(counter);
            }
        });
    }, options);

    counters.forEach(counter => observer.observe(counter));
}

// Live Notifications
function showNotifications() {
    const notifications = [
        'Sarah from New York just requested a quote',
        'Mike from Los Angeles viewed our portfolio',
        'TechStartup Inc. signed up for consultation',
        'New project completed: E-commerce Platform',
        'Jennifer from Miami booked a strategy call'
    ];

    let index = 0;
    
    setInterval(() => {
        const container = document.getElementById('notifications');
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = notifications[index % notifications.length];
        container.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 4000);
        
        index++;
    }, 8000);
}

// Multi-Step Form
let currentStep = 1;
const totalSteps = 5;

function openSignupModal() {
    document.getElementById('signupModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    resetForm();
}

function closeSignupModal() {
    document.getElementById('signupModal').classList.remove('active');
    document.body.style.overflow = '';
}

function resetForm() {
    currentStep = 1;
    updateFormStep();
}

function nextStep() {
    if (validateStep(currentStep)) {
        if (currentStep < totalSteps) {
            currentStep++;
            updateFormStep();
        }
    }
}

function prevStep() {
    if (currentStep > 1) {
        currentStep--;
        updateFormStep();
    }
}

function updateFormStep() {
    // Hide all steps
    document.querySelectorAll('.form-step').forEach(step => {
        step.classList.remove('active');
    });
    
    // Show current step
    document.getElementById(`step${currentStep}`).classList.add('active');
    
    // Update progress bar
    const progressBar = document.getElementById('progressBar');
    progressBar.className = 'progress-bar';
    if (currentStep > 1) {
        progressBar.classList.add(`step-${currentStep}`);
    }
    
    // Update step indicators
    document.querySelectorAll('.step').forEach((step, index) => {
        if (index < currentStep) {
            step.classList.add('active');
        } else {
            step.classList.remove('active');
        }
    });
}

function validateStep(step) {
    switch(step) {
        case 1:
            const projectType = document.querySelector('input[name="projectType"]:checked');
            if (!projectType) {
                showError('Please select a project type');
                return false;
            }
            break;
        case 2:
            // Budget slider always has a value
            break;
        case 3:
            const timeline = document.querySelector('input[name="timeline"]:checked');
            if (!timeline) {
                showError('Please select a timeline');
                return false;
            }
            break;
        case 4:
            // Features are optional
            break;
        case 5:
            const name = document.querySelector('input[name="name"]').value;
            const email = document.querySelector('input[name="email"]').value;
            const phone = document.querySelector('input[name="phone"]').value;
            
            if (!name || !email || !phone) {
                showError('Please fill in all required fields');
                return false;
            }
            
            if (!validateEmail(email)) {
                showError('Please enter a valid email address');
                return false;
            }
            break;
    }
    return true;
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showError(message) {
    // Create error notification
    const error = document.createElement('div');
    error.className = 'notification';
    error.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
    error.textContent = message;
    document.getElementById('notifications').appendChild(error);
    
    setTimeout(() => {
        error.remove();
    }, 3000);
}

// Budget Slider
const budgetSlider = document.getElementById('budgetSlider');
const budgetAmount = document.getElementById('budgetAmount');
const budgetLabel = document.getElementById('budgetLabel');
const budgetFeatures = document.getElementById('budgetFeatures');

if (budgetSlider) {
    budgetSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        budgetAmount.textContent = value.toLocaleString();
        
        if (value < 5000) {
            budgetLabel.textContent = 'Starter Package';
            budgetFeatures.innerHTML = `
                <ul>
                    <li>✓ 5-7 page website</li>
                    <li>✓ Mobile responsive</li>
                    <li>✓ Basic SEO setup</li>
                    <li>✓ 3 months support</li>
                </ul>
            `;
        } else if (value < 10000) {
            budgetLabel.textContent = 'Professional Package';
            budgetFeatures.innerHTML = `
                <ul>
                    <li>✓ 10-15 page website</li>
                    <li>✓ Professional design</li>
                    <li>✓ SEO optimization</li>
                    <li>✓ 6 months support</li>
                    <li>✓ Analytics setup</li>
                </ul>
            `;
        } else {
            budgetLabel.textContent = 'Enterprise Package';
            budgetFeatures.innerHTML = `
                <ul>
                    <li>✓ Unlimited pages</li>
                    <li>✓ Custom design</li>
                    <li>✓ Advanced SEO</li>
                    <li>✓ 12 months support</li>
                    <li>✓ Marketing automation</li>
                    <li>✓ Priority support</li>
                </ul>
            `;
        }
    });
}

// Form Submission
document.getElementById('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!validateStep(5)) {
        return;
    }
    
    // Collect form data
    const formData = new FormData(e.target);
    const data = {
        projectType: formData.get('projectType'),
        budget: document.getElementById('budgetSlider').value,
        timeline: formData.get('timeline'),
        features: formData.getAll('features'),
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        company: formData.get('company'),
        message: formData.get('message')
    };
    
    // Show loading state
    const submitBtn = e.target.querySelector('.btn-submit');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Sending...';
    submitBtn.disabled = true;
    
    try {
        // Send to backend
        const response = await fetch('/api/contact', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            // Show success state
            document.querySelectorAll('.form-step').forEach(step => {
                step.classList.remove('active');
            });
            document.getElementById('successStep').classList.add('active');
            
            // Trigger confetti animation
            confetti();
        } else {
            throw new Error('Failed to submit form');
        }
    } catch (error) {
        console.error('Form submission error:', error);
        showError('Something went wrong. Please try again.');
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
});

// Simple confetti effect
function confetti() {
    const confettiContainer = document.querySelector('.confetti');
    const colors = ['#6366f1', '#ec4899', '#10b981', '#f59e0b'];
    
    for (let i = 0; i < 50; i++) {
        const confettiPiece = document.createElement('div');
        confettiPiece.style.position = 'absolute';
        confettiPiece.style.width = '10px';
        confettiPiece.style.height = '10px';
        confettiPiece.style.background = colors[Math.floor(Math.random() * colors.length)];
        confettiPiece.style.left = Math.random() * 100 + '%';
        confettiPiece.style.animation = `confettiFall ${Math.random() * 3 + 2}s ease-out`;
        confettiPiece.style.transform = `rotate(${Math.random() * 360}deg)`;
        confettiContainer.appendChild(confettiPiece);
        
        setTimeout(() => {
            confettiPiece.remove();
        }, 3000);
    }
}

// Add confetti animation to CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes confettiFall {
        0% {
            transform: translateY(-100vh) rotate(0deg);
            opacity: 1;
        }
        100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Chat Widget
function toggleChat() {
    const chatWindow = document.getElementById('chatWindow');
    chatWindow.classList.toggle('active');
    
    // Remove badge when chat is opened
    if (chatWindow.classList.contains('active')) {
        document.querySelector('.chat-badge').style.display = 'none';
    }
}

// Smooth Scroll
function scrollToPortfolio() {
    document.getElementById('portfolio').scrollIntoView({
        behavior: 'smooth'
    });
}

// Magnetic Effect
document.querySelectorAll('.magnetic').forEach(element => {
    element.addEventListener('mousemove', (e) => {
        const rect = element.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        
        element.style.transform = `translate(${x * 0.1}px, ${y * 0.1}px)`;
    });
    
    element.addEventListener('mouseleave', () => {
        element.style.transform = 'translate(0, 0)';
    });
});

// Mobile Menu
const mobileToggle = document.querySelector('.mobile-toggle');
const navMenu = document.querySelector('.nav-menu');

if (mobileToggle) {
    mobileToggle.addEventListener('click', () => {
        navMenu.classList.toggle('active');
        
        // Animate hamburger
        const spans = mobileToggle.querySelectorAll('span');
        if (navMenu.classList.contains('active')) {
            spans[0].style.transform = 'rotate(45deg) translateY(8px)';
            spans[1].style.opacity = '0';
            spans[2].style.transform = 'rotate(-45deg) translateY(-8px)';
        } else {
            spans[0].style.transform = '';
            spans[1].style.opacity = '1';
            spans[2].style.transform = '';
        }
    });
}

// Navbar scroll effect
window.addEventListener('scroll', () => {
    const navbar = document.getElementById('navbar');
    if (window.scrollY > 100) {
        navbar.style.background = 'rgba(15, 23, 42, 0.95)';
        navbar.style.backdropFilter = 'blur(20px)';
    } else {
        navbar.style.background = 'rgba(15, 23, 42, 0.8)';
        navbar.style.backdropFilter = 'blur(20px)';
    }
});

// Initialize Tilt Effect (if library loaded)
if (typeof VanillaTilt !== 'undefined') {
    VanillaTilt.init(document.querySelectorAll('[data-tilt]'), {
        max: 10,
        speed: 400,
        glare: true,
        'max-glare': 0.2
    });
}

// Performance optimization - Lazy load images
const lazyImages = document.querySelectorAll('img[data-src]');
const imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            img.src = img.dataset.src;
            img.classList.add('loaded');
            imageObserver.unobserve(img);
        }
    });
});

lazyImages.forEach(img => imageObserver.observe(img));

// Exit Intent Popup (optional)
let exitIntentShown = false;
document.addEventListener('mouseleave', (e) => {
    if (e.clientY <= 0 && !exitIntentShown) {
        exitIntentShown = true;
        // Show exit intent popup
        // You can implement this feature if needed
    }
});

console.log('🚀 TownRanker - Building Digital Empires');
console.log('%c Welcome to TownRanker! ', 'background: linear-gradient(135deg, #667eea, #764ba2); color: white; font-size: 20px; padding: 10px; border-radius: 5px;');