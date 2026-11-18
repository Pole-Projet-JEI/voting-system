import { Outlet } from "react-router-dom";
import HackathonHeatmap from "../../../components/ui/HackathonHeatmap";
import jeiLogo from "../../../assets/jei2.png";
import oifLogo from "../../../assets/Logo OIF blanc 1.png";
import "./GlobalLayout.css";

export default function GlobalLayout() {
  return (
    <div className="layout-container">
      <HackathonHeatmap />
      <header className="voter-brand-header" aria-label="Event brands">
        <img className="voter-brand-logo voter-brand-logo-jei" src={jeiLogo} alt="JEI" />
        <img className="voter-brand-logo voter-brand-logo-oif" src={oifLogo} alt="OIF" />
      </header>
      <div className="content-container">
        <Outlet />
      </div>
    </div>
  );
}
