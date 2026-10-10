# FoodLoop — AI-Powered Food Rescue Platform

FoodLoop is a responsive React + TypeScript application for sharing surplus food with nearby NGOs. It includes a demo workspace, Supabase Auth/Postgres/Storage integration, row-level security policies, an explainable matching view, and an optional scikit-learn ranking API.

## Start the frontend

Requirements: Node.js 20+ and npm.

```sh
npm install
cp .env.example .env.local
npm run dev
```

Without Supabase environment variables, the app runs in **Demo workspace** mode. Listings and requests are kept in browser local storage; sample listings are clearly identified as demo data and are not sent to Supabase. Demo authentication is simulated. Use the role chooser to explore Donor, NGO, and Admin screens.

## Connect Supabase

1. Create a Supabase project.
2. Open the SQL editor and run [`supabase/schema.sql`](supabase/schema.sql). It creates the tables, indexes, signup profile trigger, storage bucket, RLS policies, and atomic request response function.
3. Copy the project URL and **publishable/anon** key into `.env.local` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. In Supabase Auth, configure the email provider and redirect URLs for your local and deployed app origins.
5. Create accounts from the app. NGO accounts start unverified. After reviewing an organization, an administrator can verify it in the SQL editor:

   ```sql
   update public.profiles set verified = true where id = 'NGO_PROFILE_UUID';
   update public.ngo_details set verified_at = now() where profile_id = 'NGO_PROFILE_UUID';
   ```

6. Grant admin access only to a trusted account from the SQL editor (replace the UUID):

   ```sql
   update public.profiles set role = 'admin' where id = 'ADMIN_PROFILE_UUID';
   ```

The client never uses a service-role key. The signup trigger ignores client attempts to request Admin. RLS scopes writes to the donor, recipient, or administrator authorized for each row. Marketplace listings are readable without signing in; requesting food, publishing, and managing requests require the appropriate signed-in role. The `food-images` bucket is public for image display, while upload, update, and delete paths are scoped to the signed-in user's UUID folder.

## Optional matching API

The dashboard currently uses a transparent weighted score: distance 30%, quantity fit 25%, urgency 20%, food requirement fit 15%, and historical acceptance 10%. Each recommendation includes a plain-language reason. It does not claim that these launch scores are machine learning.

Run the optional API:

```sh
cd ml-service
python -m venv .venv
# Activate .venv, then:
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

`GET /health` reports whether a trained scikit-learn model is active. `POST /recommend` accepts candidates and returns scores, method, and explanations. The model loads `training_data.csv` (or `FOODLOOP_TRAINING_CSV`) only when it has at least 100 resolved requests and both outcome classes. CSV columns are `distance_fit,quantity_fit,urgency,requirement_fit,acceptance_rate,accepted` where `accepted` is 0 or 1. With insufficient or missing history, the service uses the documented rule-based weights. Do not train on personally identifying information.

Set `VITE_MATCHING_API_URL=http://localhost:8000` in `.env.local` to have each matching panel call the API. The optional service is allowed to fail: the frontend immediately falls back to its transparent weighted ranking if it is offline.

## Main flows

- Create food listings with category, quantity, image, preparation/expiry time, pickup location, and collection deadline.
- Search marketplace listings by text, category, and location.
- NGO users request listings; donors approve or reject; approved requests reserve the listing; donors mark the collection complete.
- View match rationales, community impact charts, donor activity, role-specific dashboard sections, and admin controls for member access, NGO verification, and community reports.
- Supabase Auth manages account sessions. Supabase Storage stores uploaded donation photos. Supabase Postgres enforces authorization with RLS.

## Notes

- Photos in the demo and starter marketplace use Unsplash image URLs. Supabase listings can upload an image to the `food-images` bucket.
- Impact totals in Supabase mode come from an aggregate-only database function over collected listings and verified profiles. Demo mode uses labeled illustrative totals; the monthly trend chart and emissions conversion remain illustrative sample visuals.
- Distance contributes a neutral score until coordinates exist. Donors can supply pickup coordinates on a listing; set verified NGO coordinates in `ngo_details` after checking the organization’s address.
- This repository is a project starter, not a food-safety certification system. The donor remains responsible for accurate ingredients, storage, and expiry details.

