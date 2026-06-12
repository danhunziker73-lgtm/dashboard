const HA_URL =
"https://DEIN-HOMEASSISTANT.DOMAIN";



const TOKEN =
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiI0MjMwY2I1NmM2MTE0MTViOTc1NjQ0MDkxYTE3MDA0ZCIsImlhdCI6MTc4MTI1MzIyMSwiZXhwIjoyMDk2NjEzMjIxfQ.nYi4C_5Fg_gasREJIou_Fmr1IccfwboWsf7f863V1XA";



async function getStates(){


const response =
await fetch(
HA_URL+"/api/states",
{

headers:
{
"Authorization":
"Bearer "+TOKEN,

"Content-Type":
"application/json"

}

});


return await response.json();

}





function findEntity(states,id){


return states.find(
x=>x.entity_id===id
);

}





async function load(){


let states =
await getStates();



// Haus


let light =
findEntity(
states,
"light.wohnzimmer"
);



document.getElementById("house")
.innerHTML = `


<div class="item">

<span>Licht Wohnzimmer</span>

<span class="${light?.state}">
${light?.state || "nicht gefunden"}

</span>

</div>


`;





// Proxmox


let cpu =
findEntity(
states,
"sensor.proxmox_cpu"
);



document.getElementById("server")
.innerHTML = `


<div class="item">

CPU

<span>

${cpu?.state || "--"} %

</span>

</div>


<div class="item">

Status

<span class="ok">

Online

</span>

</div>


`;





// Container


document.getElementById("containers")
.innerHTML = `


<div class="item">

Immich

<span class="ok">

🟢

</span>

</div>


<div class="item">

Stirling PDF

<span class="ok">

🟢

</span>

</div>


`;



}



load();


setInterval(load,10000);
