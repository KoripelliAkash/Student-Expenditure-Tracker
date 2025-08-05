import { useLocation } from "react-router-dom";

export default function DownloadReport() {
    const location = useLocation();
    const summary = location.state;
    console.log(summary);
    const summaryx = summary.summary || "No summary available";


    return (
        <div className="download-report">
            <h1>{summaryx}</h1>
        </div>
    );
}