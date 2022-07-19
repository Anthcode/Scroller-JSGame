

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');

canvas.width = 800;
canvas.height = 600;

let gamespeed = 2;
let x = 0;
let x2 = canvas.width;





const back1 = new Image();
back1.src = 'images/_01_ground.png';
const back2 = new Image();
back2.src = 'images/_02_trees and bushes.png';
const back3 = new Image();
back3.src = 'images/_03_distant_trees.png';
const back4 = new Image();
back4.src = 'images/_04_bushes.png';
const back5 = new Image();
back5.src = 'images/_05_hill1.png';
const back6 = new Image();
back6.src = 'images/_06_hill2.png';
const back11 = new Image();
back11.src = 'images/_11_background.png';

class Layers {
    constructor(image,xspeed){

        this.x= 0;
        this.y=0;
        
        this.width =  canvas.width;
        this.height = canvas.height;
        this.x2= this.width;
        this.image = image;
        this.xspeed = xspeed;
       // this.gamespeed = gamespeed;
        this.speed = gamespeed * this.xspeed;


    }
    update(){
    
        this.speed = gamespeed*this.xspeed;
        
    if (this.x < -this.width)
    this.x = this.width + this.x2 - this.speed; else
    this.x -= this.speed;

    if (this.x2 < -this.width)
    this.x2 = this.width + this.x - this.speed; else
    this.x2 -= this.speed;

    this.x = Math.floor(this.x-this.speed);
    
    this.x2 = Math.floor(this.x2-this.speed);    
    }
    draw(){

        ctx.drawImage(this.image, this.x, this.y,this.width,this.height);
        ctx.drawImage(this.image, this.x2, this.y,this.width,this.height);
       
    }

}

const layer1 = new Layers(back1,gamespeed);

const layer2 = new Layers(back2,0.8);

const layer3 = new Layers(back3,0.6);

const layer4 = new Layers(back4,0.46);

const layer5 = new Layers(back5,0.3);

const layer6 = new Layers(back6,0.20);

const layer11 = new Layers(back11,0);


function anime() {


    ctx.clearRect(0, 0, canvas.width, canvas.height);

    
    layer11.update();
    layer11.draw();

    
    layer6.update();
    layer6.draw();

    layer5.update();
    layer5.draw();

    layer4.update();
    layer4.draw();
    
    layer3.update();
    layer3.draw();

    
    layer2.update();
    layer2.draw();

    layer1.update();
    layer1.draw();


  




    requestAnimationFrame(anime);

}


    anime();
