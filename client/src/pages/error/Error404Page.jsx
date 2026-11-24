import { t } from "../../i18n";
import { useLocation } from "react-router-dom"

export default function Error404Page(){
    const location = useLocation()
    const message = location.state?.message || t("404 Oops..! Nothing here");
    return(
        <div>
            <h1 style={{
                fontSize:'1em',
                textAlign:'center'
            }}>{message}</h1>
        </div>
        
    )
}