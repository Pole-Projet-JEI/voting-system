import "./RegisterPage.css"
/* import enter from "../../assets/enter.png" */
import React from "react"
import jeiLogo from "../../assets/jei2.png"
import { useEffect, useState } from "react"
import { registerUser } from "../../service/api";
import { useNavigate } from "react-router-dom";
import { checkConnection } from "../../service/api";
export default function RegisterPage(){

    const [userInput,setUserInput] = useState("");
    const navigate = useNavigate()

    useEffect(()=>{
        const isConnected = async ()=>{
            try{
                const result = await checkConnection();
                console.log(result);
                if(result.connected){
                    navigate("/home")
                }
            }
            catch(error){
                console.log(error);
            }
        }
        isConnected();
    },[])

    const submitHandler = async (event)=>{
        event.preventDefault();
        try{
        const result = await registerUser(userInput);
        navigate("/home");
        console.log(result);
        }
        catch(error){
            console.log(error)
        }
    }

    return(
        <div className="register-form-container">
            <img src={jeiLogo} alt="JEILogo" width="100px" height="50px"/>
            <div className="title-container">
                <h1 className="title-1">Hack for good</h1>
                <h1 className="title-2">3.0</h1>
            </div>
            <h2 style={{fontSize:'1em', color:'rgba(255,255,255,0.55)'}}>Voting System</h2>
            <form onSubmit={submitHandler} style={{position:'relative'}}>
                <input type="text" name="unique-code" id="unique-code" placeholder="Enter your code" value={userInput} onChange={(e)=>{setUserInput(e.target.value)}}/>
                <button id="register-form-submit" type="submit"><svg width="25px" height="25px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path fill-rule="evenodd" clip-rule="evenodd" d="M3 14a1 1 0 0 1 1-1h12a3 3 0 0 0 3-3V6a1 1 0 1 1 2 0v4a5 5 0 0 1-5 5H4a1 1 0 0 1-1-1z" fill="#ffffff"></path><path fill-rule="evenodd" clip-rule="evenodd" d="M3.293 14.707a1 1 0 0 1 0-1.414l4-4a1 1 0 0 1 1.414 1.414L5.414 14l3.293 3.293a1 1 0 1 1-1.414 1.414l-4-4z" fill="#ffffff"></path></g></svg></button>
            </form>
        </div>
    )
}