const o = (value, label) => ({ value, label });
export const ROLES = [o('attendee', 'Here to enjoy the show'), o('performer', 'Performing'),
  o('volunteer', 'Volunteering'), o('food_recipient', 'Picking up food')];
export const GENDERS = [o('woman', 'Woman'), o('man', 'Man'), o('nonbinary', 'Non-binary'), o('self', 'Self-describe')];
export const RACES = [o('black', 'Black or African American'), o('white', 'White'), o('hispanic', 'Hispanic or Latino'),
  o('asian', 'Asian'), o('mena', 'Middle Eastern or North African'), o('native', 'American Indian or Alaska Native'),
  o('pacific', 'Native Hawaiian or Pacific Islander'), o('other', 'Other')];
export const VETERAN = [o('yes', 'Yes'), o('no', 'No')];
export const HELP = [o('food_bag', 'Food bag'), o('meal', 'Hot meal'), o('referral', 'Resource referral')];
export const values = (list) => list.map((x) => x.value);
