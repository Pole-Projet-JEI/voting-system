import { Outlet } from "react-router-dom";
import HackathonHeatmap from "../../../components/ui/HackathonHeatmap";
import "./GlobalLayout.css";

export default function GlobalLayout() {
  return (
    <div className="layout-container">
      <HackathonHeatmap />
      <div className="content-container">
        <Outlet />
      </div>
    </div>
  );
}
