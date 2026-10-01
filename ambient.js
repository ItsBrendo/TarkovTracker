// Share the restrained parallax and particle scene between login and tracker pages.
function initializeAmbientScene() {
  const canvas = document.querySelector('.ambient-particles');
  const context = canvas?.getContext('2d');
  const scene = document.querySelector('.ambient-scene');
  if (!canvas || !context || !scene) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let userReducedMotion = localStorage.getItem('tarkov-field-log.reduce-motion.v1') === 'true';
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0, rotate: 0, targetRotate: 0 };
  let particles = [];
  let width = 0;
  let height = 0;
  let frame = 0;

  function shouldReduceMotion() {
    return reducedMotion.matches || userReducedMotion;
  }

  function resize() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const count = width < 600 ? 38 : 92;
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 1.25 + 0.4,
      speed: Math.random() * 0.2 + 0.07,
      drift: Math.random() * 0.12 - 0.06,
      phase: Math.random() * Math.PI * 2
    }));
    if (shouldReduceMotion()) draw(0, true);
  }

  function draw(time, still = false) {
    context.clearRect(0, 0, width, height);
    for (const particle of particles) {
      const shimmer = 0.15 + (Math.sin(time * 0.0008 + particle.phase) + 1) * 0.2;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fillStyle = `rgba(198, 219, 214, ${still ? 0.28 : shimmer})`;
      context.fill();
      if (!still) {
        particle.y -= particle.speed;
        particle.x += particle.drift;
        if (particle.y < -3) {
          particle.y = height + 3;
          particle.x = Math.random() * width;
        }
        if (particle.x < -3) particle.x = width + 3;
        if (particle.x > width + 3) particle.x = -3;
      }
    }
  }

  function animate(time) {
    pointer.x += (pointer.targetX - pointer.x) * 0.065;
    pointer.y += (pointer.targetY - pointer.y) * 0.065;
    pointer.rotate += (pointer.targetRotate - pointer.rotate) * 0.065;
    scene.style.setProperty('--parallax-x', `${pointer.x.toFixed(2)}px`);
    scene.style.setProperty('--parallax-y', `${pointer.y.toFixed(2)}px`);
    scene.style.setProperty('--parallax-rotate', `${pointer.rotate.toFixed(3)}deg`);
    draw(time);
    frame = window.requestAnimationFrame(animate);
  }

  function updateMotionPreference() {
    const shouldReduce = shouldReduceMotion();
    document.body.dataset.reducedMotion = String(shouldReduce);
    if (shouldReduce) {
      window.cancelAnimationFrame(frame);
      frame = 0;
      pointer.targetX = 0;
      pointer.targetY = 0;
      pointer.targetRotate = 0;
      scene.style.setProperty('--parallax-x', '0px');
      scene.style.setProperty('--parallax-y', '0px');
      scene.style.setProperty('--parallax-rotate', '0deg');
      draw(0, true);
    } else if (!document.hidden && !frame) {
      frame = window.requestAnimationFrame(animate);
    }
  }

  window.addEventListener('pointermove', (event) => {
    if (shouldReduceMotion() || event.pointerType === 'touch') return;
    pointer.targetX = (0.5 - event.clientX / width) * 32;
    pointer.targetY = (0.5 - event.clientY / height) * 22;
    pointer.targetRotate = (0.5 - event.clientX / width) * 0.7;
  }, { passive: true });
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      window.cancelAnimationFrame(frame);
      frame = 0;
    } else {
      updateMotionPreference();
    }
  });
  reducedMotion.addEventListener('change', updateMotionPreference);
  document.addEventListener('field-log:motion-preference', (event) => {
    userReducedMotion = Boolean(event.detail);
    updateMotionPreference();
  });
  resize();
  updateMotionPreference();
}

initializeAmbientScene();