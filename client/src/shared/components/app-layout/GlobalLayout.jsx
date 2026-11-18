import { Outlet } from "react-router-dom";
import PixelField from "../pixel-field/PixelField";
import "./GlobalLayout.css";

export default function GlobalLayout() {
  return (
    <>
      <PixelField />
      <div className="layout-container">
        <div className="content-container">
          <Outlet />
        </div>
      </div>
    </>
  );
}
