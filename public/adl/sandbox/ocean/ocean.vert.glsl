varying vec3 vNormal;
varying vec3 vSundir;
varying vec3 vCamDir;
varying vec3 texcoord0;
varying float vCamLength;
varying mat3 TBN;
varying float h;
uniform vec3 oCamPos;
uniform vec3 wPosition;
uniform float uChop;
vec3 sundir = vec3(.5, .5, .1);
uniform float t;
#define numWaves 9
#define PI 3.1415926535897932384626433832795
uniform float uMag;

uniform vec3 waves[9];

float L[numWaves];
float A[numWaves];
float S[numWaves];
vec2 D[numWaves];
void setup() {

      for(int i =0; i < numWaves; i++)
      {
            L[i] = waves[i].x;
            D[i] = normalize(vec2(waves[i].y, waves[i].z));
      }

}
void main() {

      setup();
      float x = position.x;
      float y = position.y;
      float gA = uMag;
      
      
      vec3 N = vec3(0.0,0.0,0.0);
      vec3 B = vec3(0.0,0.0,0.0);

      vec3 tPos = position + wPosition;
      texcoord0 = tPos;
      tPos.z = 0.0;
      float camDist = length(oCamPos.xy - position.xy);
      for (int i = 0; i < numWaves; i++)
      {
            L[i] *= uMag/2.0;
            float w =  2.0 * PI / L[i];
            A[i] = 0.5/(w * 2.718281828459045) * min(1.0,(30.0/camDist)); //for ocean on Earth, A is ususally related to L
            S[i] = 3.0 * PI/(w  * 2.718281828459045);  //for ocean on Earth, S is ususally related to L
            float q = S[i] * w;
           
            vec2 xy = vec2(x, y);

            // simple sum-of-sines
            //float hi = A[i] * sin( dot(D[i], xy) * w + t * q);
            //h += hi * gA;
           
            //Gerstner


            //position
            float Q = uChop / uMag;
            float Qi = Q/(w*A[i]*float(numWaves)); // *numWaves?
            float xi = Qi * A[i] * D[i].x * cos( dot(w*D[i],xy) + q*t);
            float yi = Qi * A[i] * D[i].y * cos( dot(w*D[i],xy) + q*t);
            float hi =  A[i] * sin( dot(w*D[i],xy) + q * t );

            tPos.x += xi * gA;
            tPos.y += yi * gA;
            tPos.z += hi * gA;

            float WA = w * A[i] *gA;
            float S0 = sin(w * dot(D[i],tPos.xy) + q*t);
            float C0 = cos(w * dot(D[i],tPos.xy) + q*t);


            N.x +=  D[i].x * WA *C0;
            N.y +=  D[i].y * WA *C0;
            N.z +=  Qi * WA *S0;

            B.x += Qi * (D[i].x*D[i].x) * WA * S0;
            B.y += Qi * D[i].y * D[i].y *WA * S0;
            B.z += D[i].x * WA * C0;


      }
      
      h = tPos.z;
      vec3 tNormal = normalize(vec3(-N.x, -N.y, 1.0-N.z));
      vec3 tBinormal = normalize(vec3(1.0-B.x, -B.y, N.z));
      vec3 tTangent = cross(tBinormal,tNormal);
      
      TBN = mat3(tBinormal.x,tBinormal.y,tBinormal.z,
                      tTangent.x,tTangent.y,tTangent.z,
                      tNormal.x,tNormal.y,tNormal.z);

      
      tPos.z += wPosition.z;
      vNormal = normalize(tNormal);
      vSundir = normalize(sundir);
      vCamLength = length(oCamPos - (tPos -  wPosition)); 
      vCamDir =  normalize(oCamPos - (tPos -  wPosition));
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(tPos -  wPosition, 1);
}