int stop_distance = 12;// Khoảng cách phát hiện vật cản
//Kết nối SRF 05 OR 04
const int trigPin = 11; // kết nối chân trig với chân 11 arduino
const int echoPin = 12; // kết nối chân echo với chân 12 arduino

//L298 kết nối arduino
const int motorA1      = 3;  // kết nối chân IN1 với chân 3 arduino
const int motorA2      = 4;  // kết nối chân IN2 với chân 4 arduino
const int motorAspeed  = 5;  // kết nối chân ENA với chân 5 arduino
const int motorB1      = 7; // kết nối chân IN3 với chân 7 arduino
const int motorB2      = 8; // kết nối chân IN4 với chân 8 arduino
const int motorBspeed  = 6;  // kết nối chân ENB với chân 6 arduino

//kết nối của 3 cảm biến hồng ngoại (dò line )
const int L_S = 9; // cb dò line phải
const int S_S = 2; // cb dò line giữa
const int R_S = 10; //cb dò line trái

//kết nối cảm biến ánh sáng

const int Cbquang = A0; //cb quang
const int den = A1; // điều khiển đèn

int left_sensor_state;// biến lưu cảm biến hồng ngoại line trái
int s_sensor_state;   // biến lưu cảm biến hồng ngoại line giữa
int right_sensor_state;// biến lưu cảm biến hồng ngoại line phải
int CbQ;

long duration; //
int distance;  // biến khoảng cách

void setup() {
  pinMode(L_S, INPUT); // chân cảm biến khai báo là đầu vào
  pinMode(R_S, INPUT);
  pinMode(S_S, INPUT);
  pinMode(Cbquang, INPUT);
  pinMode(den, OUTPUT);
  pinMode(motorA1, OUTPUT);
  pinMode(motorA2, OUTPUT);
  pinMode(motorB1, OUTPUT);
  pinMode(motorB2, OUTPUT);
  pinMode(motorAspeed, OUTPUT);
  pinMode(motorBspeed, OUTPUT);
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);

  Serial.begin(9600);
  analogWrite(motorAspeed, 125); // tốc độ động cơ a ban đầu 120 ( 0 - 255)
  analogWrite(motorBspeed, 125 );// tốc độ động cơ b ban đầu 120 ( 0 - 255)
  delay(2000);
}

void loop() {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  duration = pulseIn(echoPin, HIGH);
  distance = duration * 0.034 / 2;
  Serial.print("Distance: ");
  Serial.println(distance);
  
  CbQ = digitalRead(Cbquang);
  left_sensor_state = digitalRead(L_S);
  s_sensor_state = digitalRead(S_S);
  right_sensor_state = digitalRead(R_S);

  if (CbQ == HIGH) 
  {
    digitalWrite(den, HIGH);
  }
  else 
  {
    digitalWrite(den, LOW);
  }

  if ((digitalRead(L_S) == 0) && (digitalRead(S_S) == 1) && (digitalRead(R_S) == 0)) 
  {
    forword(); // đi tiến
  }

  else if ((digitalRead(L_S) == 1) && (digitalRead(S_S) == 1) && (digitalRead(R_S) == 0)) 
  {
    turnLeft(); // rẻ trái
  }
  else if ((digitalRead(L_S) == 1) && (digitalRead(S_S) == 0) && (digitalRead(R_S) == 0)) 
  {
    turnLeft(); // rẻ trái
  }

  else if ((digitalRead(L_S) == 0) && (digitalRead(S_S) == 1) && (digitalRead(R_S) == 1)) 
  {
    turnRight(); // rẻ phải
  }
  else if ((digitalRead(L_S) == 0) && (digitalRead(S_S) == 0) && (digitalRead(R_S) == 1)) 
  {
    turnRight(); // rẻ phải
  }

  else if ((digitalRead(L_S) == 1) && (digitalRead(S_S) == 1) && (digitalRead(R_S) == 1)) 
  {
    Stop(); // stop
  }

  if (distance < stop_distance) // nếu khoảng cách nhỏ hơn giới hạn
  {
    digitalWrite (motorA1, HIGH); // cho xe robot chạy lùi 1 đoạn
    digitalWrite(motorA2, LOW);
    digitalWrite (motorB1, LOW);
    digitalWrite(motorB2, HIGH);
    delay(300);

    digitalWrite (motorA1, LOW);
    digitalWrite(motorA2, LOW);
    digitalWrite (motorB1, LOW);
    digitalWrite(motorB2, LOW);
    delay(200);

    digitalWrite (motorA1, HIGH); // cho xe robot xoay sang trái
    digitalWrite(motorA2, LOW);
    digitalWrite (motorB1, HIGH);
    digitalWrite(motorB2, LOW);
    delay(280);
    digitalWrite (motorA1, LOW);
    digitalWrite(motorA2, LOW);
    digitalWrite (motorB1, LOW);
    digitalWrite(motorB2, LOW);
    delay(200);

    digitalWrite (motorA1, LOW); //cho xe robot đi thẳng 1 đoạn
    digitalWrite(motorA2, HIGH);
    digitalWrite (motorB1, HIGH);
    digitalWrite(motorB2, LOW);
    delay(550);
    digitalWrite (motorA1, LOW);
    digitalWrite(motorA2, LOW);
    digitalWrite (motorB1, LOW);
    digitalWrite(motorB2, LOW);
    delay(200);

    digitalWrite (motorA1, LOW); // cho xe robot xoay phải 1 đoạn
    digitalWrite(motorA2, HIGH);
    digitalWrite (motorB1, LOW);
    digitalWrite(motorB2, LOW);
    delay(400);
    digitalWrite (motorA1, LOW);
    digitalWrite(motorA2, LOW);
    digitalWrite (motorB1, LOW);
    digitalWrite(motorB2, LOW);
    delay(200);
    ///////////////////
    digitalWrite (motorA1, LOW); //cho xe robot đi thẳng 1 đoạn
    digitalWrite(motorA2, HIGH);
    digitalWrite (motorB1, HIGH);
    digitalWrite(motorB2, LOW);
    delay(500);
    digitalWrite (motorA1, LOW);
    digitalWrite(motorA2, LOW);
    digitalWrite (motorB1, LOW);
    digitalWrite(motorB2, LOW);
    delay(200);
    ////////////////////////
    digitalWrite (motorA1, HIGH); // cho xe robot xoay sang trái
    digitalWrite(motorA2, LOW);
    digitalWrite (motorB1, HIGH);
    digitalWrite(motorB2, LOW);
    delay(280);
    digitalWrite (motorA1, LOW);
    digitalWrite(motorA2, LOW);
    digitalWrite (motorB1, LOW);
    digitalWrite(motorB2, LOW);
    delay(200);

    digitalWrite (motorA1, LOW); //cho xe robot đi thẳng 1
    digitalWrite(motorA2, HIGH);
    digitalWrite (motorB1, HIGH);
    digitalWrite(motorB2, LOW);

    while (left_sensor_state == LOW) 
    {
      left_sensor_state = digitalRead(L_S);
      s_sensor_state = digitalRead(S_S);
      right_sensor_state = digitalRead(R_S);
      Serial.println("in the first while");
    }
  }
}

void forword() { // chương trình con xe robot đi tiến
  digitalWrite (motorA1, LOW);
  digitalWrite(motorA2, HIGH);
  digitalWrite (motorB1, HIGH);
  digitalWrite(motorB2, LOW);
}
void turnRight() {
  digitalWrite (motorA1, LOW);
  digitalWrite(motorA2, LOW);
  digitalWrite (motorB1, HIGH);
  digitalWrite(motorB2, LOW);
}
void turnLeft() {
  digitalWrite (motorA1, LOW);
  digitalWrite(motorA2, HIGH);
  digitalWrite (motorB1, LOW);
  digitalWrite(motorB2, LOW);
}
void Stop() {
  digitalWrite (motorA1, LOW);
  digitalWrite(motorA2, LOW);
  digitalWrite (motorB1, LOW);
  digitalWrite(motorB2, LOW);
}
