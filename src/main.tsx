import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

function preventPinchZoom(event: TouchEvent) {
  if (event.touches.length > 1) {
    event.preventDefault();
  }
}

function preventGestureZoom(event: Event) {
  event.preventDefault();
}

document.addEventListener("touchmove", preventPinchZoom, { passive: false });
document.addEventListener("gesturestart", preventGestureZoom, { passive: false });
document.addEventListener("gesturechange", preventGestureZoom, { passive: false });
document.addEventListener("gestureend", preventGestureZoom, { passive: false });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
